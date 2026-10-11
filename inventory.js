let db = null;
let allDocs = [];          // 当前拉取到的所有库存记录
let filterPart = null;     // 从汇总页跳过来时携带的料号

window.onAuthReady = function () {
  db = initDB(window.AppwriteClient);

  // 检查 URL 是否带 ?part=xxx
  const params = new URLSearchParams(location.search);
  filterPart = params.get('part');

  if (filterPart) {
    document.getElementById('filter-notice').classList.remove('hidden');
    document.getElementById('filter-part-text').textContent = filterPart;
  }

  loadInventory();
};

/* 加载库存列表 */
async function loadInventory() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.inventory, [
    Appwrite.Query.limit(5000),
    Appwrite.Query.orderAsc('part_number')
  ]);
  allDocs = res.documents;
  applyFilters();
}

/* 应用过滤（URL 料号 + 搜索框） */
function applyFilters() {
  const keyword = (document.getElementById('inv-search').value || '').trim().toLowerCase();

  let docs = allDocs;
  if (filterPart) {
    docs = docs.filter(d => d.part_number === filterPart);
  }
  if (keyword) {
    docs = docs.filter(d =>
      (d.part_number || '').toLowerCase().includes(keyword) ||
      (d.part_name || '').toLowerCase().includes(keyword)
    );
  }

  renderTable(docs);
}

/* 渲染表格 */
function renderTable(docs) {
  const tbody = document.querySelector('#inv-table tbody');
  if (!docs.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;">暂无库存数据</td></tr>';
    return;
  }
  tbody.innerHTML = docs.map(d => `
    <tr>
      <td>${d.part_number || ''}</td>
      <td>${d.part_name || ''}</td>
      <td><span class="qty-badge">${d.quantity ?? 0}</span></td>
      <td>${d.location || ''}</td>
      <td>
        <button onclick="openEditInv('${d.$id}')">编辑</button>
        <button onclick="deleteInv('${d.$id}')">删除</button>
      </td>
    </tr>`).join('');
}

/* 搜索 */
document.getElementById('inv-search-btn').onclick = applyFilters;
document.getElementById('inv-clear-btn').onclick = () => {
  document.getElementById('inv-search').value = '';
  filterPart = null;
  document.getElementById('filter-notice').classList.add('hidden');
  // 清除 URL 参数
  history.replaceState(null, '', 'inventory.html');
  applyFilters();
};
document.getElementById('inv-search').addEventListener('input', applyFilters);

/* 新增 / 编辑弹窗 */
const invModal = document.getElementById('inv-modal');
const invErr = document.getElementById('inv-form-error');

document.getElementById('inv-add').onclick = () => {
  document.getElementById('inv-modal-title').textContent = '新增库存';
  document.getElementById('inv-form-id').value = '';
  document.getElementById('inv-form-part').value = '';
  document.getElementById('inv-form-name').value = '';
  document.getElementById('inv-form-qty').value = '';
  document.getElementById('inv-form-loc').value = '';
  document.getElementById('inv-form-part').disabled = false;
  invErr.textContent = '';
  invModal.classList.remove('hidden');
};

window.openEditInv = async function (docId) {
  try {
    const doc = await db.getDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.inventory, docId);
    document.getElementById('inv-modal-title').textContent = '编辑库存';
    document.getElementById('inv-form-id').value = doc.$id;
    document.getElementById('inv-form-part').value = doc.part_number || '';
    document.getElementById('inv-form-name').value = doc.part_name || '';
    document.getElementById('inv-form-qty').value = doc.quantity ?? '';
    document.getElementById('inv-form-loc').value = doc.location || '';
    document.getElementById('inv-form-part').disabled = true;   // 编辑时料号不可改
    invErr.textContent = '';
    invModal.classList.remove('hidden');
  } catch (e) {
    alert('读取失败：' + e.message);
  }
};

document.getElementById('inv-form-cancel').onclick = () => invModal.classList.add('hidden');

document.getElementById('inv-form-save').onclick = async () => {
  const docId = document.getElementById('inv-form-id').value;
  const part_number = document.getElementById('inv-form-part').value.trim();
  const part_name = document.getElementById('inv-form-name').value.trim();
  const qtyRaw = document.getElementById('inv-form-qty').value;
  const quantity = parseInt(qtyRaw, 10);
  const location = document.getElementById('inv-form-loc').value.trim();

  if (!part_number || !part_name || !location) {
    invErr.textContent = '物料料号、物料名称、库位必填';
    return;
  }
  if (isNaN(quantity) || quantity < 0) {
    invErr.textContent = '物料数量必须是非负整数';
    return;
  }

  try {
    if (docId) {
      // 编辑
      await db.updateDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.inventory, docId, {
        part_name, quantity, location
      });
    } else {
      // 新增：检查库位是否已被其他料号占用
      const dup = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.inventory, [
        Appwrite.Query.equal('location', location),
        Appwrite.Query.limit(1)
      ]);
      if (dup.documents.length && dup.documents[0].part_number !== part_number) {
        invErr.textContent = `库位 ${location} 已被物料 ${dup.documents[0].part_number} 占用，不能分配给新料号`;
        return;
      }

      await db.createDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.inventory, ID.unique(), {
        part_number, part_name, quantity, location
      });
    }
    invModal.classList.add('hidden');
    await loadInventory();
  } catch (e) {
    invErr.textContent = '保存失败：' + (e.message || e);
  }
};

/* 删除 */
window.deleteInv = async function (docId) {
  if (!confirm('确认删除该库存记录？')) return;
  try {
    await db.deleteDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.inventory, docId);
    await loadInventory();
  } catch (e) {
    alert('删除失败：' + e.message);
  }
};

/* 导入 CSV */
document.getElementById('inv-import').onclick = () =>
  document.getElementById('inv-file-input').click();

document.getElementById('inv-file-input').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;

  const { headers, rows } = await readCSV(f);

  // 校验表头
  const required = ['part_number', 'part_name', 'quantity', 'location'];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    alert('CSV 缺少必需列：' + missing.join(', '));
    e.target.value = '';
    return;
  }

  let ok = 0, fail = 0;
  const errors = [];

  // 先做库位冲突预检（防止导入中途失败）
  const seenLocations = {};   // location -> part_number
  const conflictRows = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const data = {};
    headers.forEach((h, idx) => {
      const v = row[idx];
      if (v === undefined || v === null || v === '') return;
      if (h === 'quantity') {
        const n = Number(v);
        if (!isNaN(n)) data[h] = n;
      } else {
        data[h] = String(v).trim();
      }
    });

    if (!data.part_number || !data.part_name || !data.location) continue;

    // 同一 CSV 内库位重复
    if (seenLocations[data.location]) {
      if (seenLocations[data.location] !== data.part_number) {
        conflictRows.push(`第 ${i+2} 行：库位 ${data.location} 与料号 ${seenLocations[data.location]} 冲突`);
        continue;
      }
    } else {
      seenLocations[data.location] = data.part_number;
    }
  }

  if (conflictRows.length) {
    alert('CSV 内部库位冲突：\n' + conflictRows.slice(0, 10).join('\n') +
          (conflictRows.length > 10 ? `\n...还有 ${conflictRows.length-10} 条` : ''));
    e.target.value = '';
    return;
  }

  // 逐条入库
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const data = {};
    headers.forEach((h, idx) => {
      const v = row[idx];
      if (v === undefined || v === null || v === '') return;
      if (h === 'quantity') {
        const n = Number(v);
        if (isNaN(n)) return;
        data[h] = n;
      } else {
        data[h] = String(v).trim();
      }
    });
    if (!data.part_number || !data.part_name || !data.location) continue;

    try {
      // 库位已被其他料号占用 → 拒绝
      const dup = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.inventory, [
        Appwrite.Query.equal('location', data.location),
        Appwrite.Query.limit(1)
      ]);
      if (dup.documents.length && dup.documents[0].part_number !== data.part_number) {
        errors.push(`第 ${i+2} 行：库位 ${data.location} 已被 ${dup.documents[0].part_number} 占用`);
        fail++;
        continue;
      }

      await db.createDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.inventory, ID.unique(), data);
      ok++;
    } catch (err) {
      errors.push(`第 ${i+2} 行：${err.message}`);
      fail++;
    }
  }

  let msg = `导入完成：成功 ${ok} 条，失败 ${fail} 条`;
  if (errors.length) {
    msg += '\n\n失败明细（前 10 条）：\n' + errors.slice(0, 10).join('\n');
    if (errors.length > 10) msg += `\n...还有 ${errors.length - 10} 条`;
  }
  alert(msg);

  await loadInventory();
  e.target.value = '';
};

/* 导出 CSV */
document.getElementById('inv-export').onclick = async () => {
  const headers = ['part_number', 'part_name', 'quantity', 'location'];
  const rows = allDocs.map(d => headers.map(h => d[h] ?? ''));
  exportCSV(headers, rows, 'inventory');
};
