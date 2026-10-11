let db = null;
let currentWoNumber = null;
let currentWoDoc = null;
let currentFinishes = [];

/* 从 URL 参数里取工单号 */
function getWoNumberFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('wo');
}

window.onAuthReady = async function () {
  db = initDB(window.AppwriteClient);

  currentWoNumber = getWoNumberFromUrl();
  if (!currentWoNumber) {
    alert('未指定工单号');
    location.href = 'finish.html';
    return;
  }

  await loadWoInfo();
  await loadFinishes();

  document.getElementById('detail-add').onclick = openAddModal;
  document.getElementById('detail-export').onclick = handleExport;

  document.getElementById('detail-form-cancel').onclick = () =>
    document.getElementById('detail-modal').classList.add('hidden');
  document.getElementById('detail-form-save').onclick = handleSave;
};

/* 加载工单信息 */
async function loadWoInfo() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.wo, [
    Appwrite.Query.equal('wo_number', currentWoNumber),
    Appwrite.Query.limit(1)
  ]);
  if (!res.documents.length) {
    alert('未找到该工单');
    location.href = 'finish.html';
    return;
  }
  currentWoDoc = res.documents[0];

  document.getElementById('wo-title').textContent = `工单 ${currentWoDoc.wo_number}`;
  document.getElementById('wo-product-number').textContent = currentWoDoc.product_number || '-';
  document.getElementById('wo-product-name').textContent = currentWoDoc.product_name || '-';
  document.getElementById('wo-plan-qty').textContent = currentWoDoc.plan_qty ?? '-';
  document.getElementById('wo-produce-date').textContent = currentWoDoc.produce_date || '-';
  document.getElementById('wo-status').textContent =
    currentWoDoc.status === 'completed' ? '已完成'
    : currentWoDoc.status === 'in_progress' ? '生产中'
    : '待生产';
}

/* 加载该工单的入库记录 */
async function loadFinishes() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.finish, [
    Appwrite.Query.equal('wo_number', currentWoNumber),
    Appwrite.Query.orderDesc('finished_at'),
    Appwrite.Query.limit(5000)
  ]);
  currentFinishes = res.documents;
  renderDetailTable();
  renderProgress();
}

/* 渲染明细表 */
function renderDetailTable() {
  const tbody = document.querySelector('#detail-table tbody');
  if (!currentFinishes.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;">暂无入库记录</td></tr>';
    return;
  }
  tbody.innerHTML = currentFinishes.map(d => `
    <tr>
      <td>${d.product_number || ''}</td>
      <td><b>${d.finish_qty ?? ''}</b></td>
      <td>${d.operator || ''}</td>
      <td>${formatTime(d.finished_at)}</td>
      <td><button onclick="deleteDetailRow('${d.$id}')">删除</button></td>
    </tr>`).join('');
}

/* 格式化时间显示 */
function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}

/* 渲染进度条 */
function renderProgress() {
  const planQty = Number(currentWoDoc.plan_qty) || 0;
  const finishedQty = currentFinishes.reduce((s, d) => s + (Number(d.finish_qty) || 0), 0);
  const remainQty = Math.max(planQty - finishedQty, 0);
  const percent = planQty > 0 ? Math.min(Math.round(finishedQty / planQty * 100), 100) : 0;

  document.getElementById('finished-qty').textContent = finishedQty;
  document.getElementById('remain-qty').textContent = remainQty;
  document.getElementById('progress-text').textContent = percent + '%';

  const bar = document.getElementById('progress-bar');
  bar.style.width = percent + '%';
  bar.style.background = percent >= 100 ? '#16a34a' : '#2563eb';
}

/* 打开新增弹窗 */
function openAddModal() {
  const planQty = Number(currentWoDoc.plan_qty) || 0;
  const finishedQty = currentFinishes.reduce((s, d) => s + (Number(d.finish_qty) || 0), 0);
  const remainQty = Math.max(planQty - finishedQty, 0);

  if (remainQty <= 0) {
    alert('该工单已全部入库完成，无需再入库。');
    return;
  }

  document.getElementById('detail-form-part').value = currentWoDoc.product_number || '';
  document.getElementById('detail-form-qty').value = '';
  document.getElementById('detail-form-operator').value = '';
  document.getElementById('detail-max-hint').textContent = remainQty;
  document.getElementById('detail-form-error').textContent = '';
  document.getElementById('detail-modal').classList.remove('hidden');
}

/* 保存入库 */
async function handleSave() {
  const errEl = document.getElementById('detail-form-error');
  const product_number = document.getElementById('detail-form-part').value.trim();
  const finish_qty = parseInt(document.getElementById('detail-form-qty').value, 10);
  const operator = document.getElementById('detail-form-operator').value.trim();

  const planQty = Number(currentWoDoc.plan_qty) || 0;
  const finishedQty = currentFinishes.reduce((s, d) => s + (Number(d.finish_qty) || 0), 0);
  const remainQty = Math.max(planQty - finishedQty, 0);

  if (!finish_qty || finish_qty <= 0) {
    errEl.textContent = '请输入有效的入库数量';
    return;
  }
  if (finish_qty > remainQty) {
    errEl.textContent = `入库数量不能超过未入库数量（${remainQty}）`;
    return;
  }

  try {
    await db.createDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.finish, ID.unique(), {
      wo_number: currentWoNumber,
      product_number,
      finish_qty,
      operator,
      finished_at: new Date().toISOString()
    });

    // 累计入库 == 计划数量 → 自动关结工单
    const newTotal = finishedQty + finish_qty;
    if (newTotal >= planQty && currentWoDoc.status !== 'completed') {
      await db.updateDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.wo, currentWoDoc.$id, {
        status: 'completed'
      });
      currentWoDoc.status = 'completed';
      document.getElementById('wo-status').textContent = '已完成';
    }

    document.getElementById('detail-modal').classList.add('hidden');
    await loadFinishes();
  } catch (e) {
    errEl.textContent = '保存失败：' + (e.message || e);
  }
}

/* 删除一条入库记录 */
window.deleteDetailRow = async function (docId) {
  if (!confirm('确认删除该入库记录？删除后工单状态可能需要手动调整。')) return;
  try {
    await db.deleteDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.finish, docId);

    // 删除后如果工单是 completed，但总量已低于计划数，则恢复为 in_progress
    await db.getDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.wo, currentWoDoc.$id).then(async (freshWo) => {
      currentWoDoc = freshWo;
      const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.finish, [
        Appwrite.Query.equal('wo_number', currentWoNumber),
        Appwrite.Query.limit(5000)
      ]);
      const total = res.documents.reduce((s, d) => s + (Number(d.finish_qty) || 0), 0);
      const planQty = Number(currentWoDoc.plan_qty) || 0;

      if (currentWoDoc.status === 'completed' && total < planQty) {
        await db.updateDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.wo, currentWoDoc.$id, {
          status: 'in_progress'
        });
        currentWoDoc.status = 'in_progress';
        document.getElementById('wo-status').textContent = '生产中';
      }
    });

    await loadFinishes();
  } catch (e) {
    alert('删除失败：' + e.message);
  }
};

/* 导出当前工单的入库记录 */
function handleExport() {
  const headers = ['wo_number', 'product_number', 'finish_qty', 'operator', 'finished_at'];
  const rows = currentFinishes.map(d => headers.map(h => d[h] ?? ''));
  exportCSV(headers, rows, `finish_${currentWoNumber}`);
}
