const { Databases, Query, ID } = Appwrite;
let db = null;

window.onAuthReady = function () {
  db = new Databases(window.AppwriteClient);
  loadWorkOrders();
};

/* ==================== 通用工具 ==================== */

function exportCSV(headers, rows, filename) {
  const wsData = [headers, ...rows];
  // 关键：在 CSV 内容最前面加 UTF-8 BOM
  const csv = '\uFEFF' + XLSX.utils.sheet_to_csv(
    XLSX.utils.aoa_to_sheet(wsData)
  );
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function readCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      let text = e.target.result;

      // 去掉 UTF-8 BOM（如果有）
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

      // 按行拆分（兼容 \r\n 和 \n）
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');

      // 简单 CSV 解析（支持双引号包围）
      const parseRow = (line) => {
        const cells = [];
        let cur = '', inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (inQuote) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') { inQuote = false; }
            else { cur += ch; }
          } else {
            if (ch === '"') { inQuote = true; }
            else if (ch === ',') { cells.push(cur); cur = ''; }
            else { cur += ch; }
          }
        }
        cells.push(cur);
        return cells;
      };

      const headers = parseRow(lines[0]);
      const rows = lines.slice(1).map(parseRow);
      resolve({ headers, rows });
    };
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');   // ← 关键：强制 UTF-8
  });
}

// 各表里的数字字段
const NUMERIC_FIELDS = {
  [CONFIG.TABLES.wo]: ['plan_qty'],
  [CONFIG.TABLES.bom]: ['unit_qty'],
  [CONFIG.TABLES.issue]: ['issue_qty'],
  [CONFIG.TABLES.return]: ['return_qty']
};

async function batchImport(tableId, headers, rows) {
  const numericKeys = NUMERIC_FIELDS[tableId] || [];
  let ok = 0, fail = 0;

  for (const row of rows) {
    const data = {};
    headers.forEach((h, i) => {
      const v = row[i];
      if (v === undefined || v === null || v === '') return;

      if (numericKeys.includes(h)) {
        // 数字字段：转成 Number
        const n = Number(v);
        if (isNaN(n)) return;
        data[h] = n;
      } else {
        // 其他字段：字符串
        data[h] = String(v).trim();
      }
    });

    try {
      await db.createDocument(CONFIG.DATABASE_ID, tableId, ID.unique(), data);
      ok++;
    } catch (e) {
      console.error('导入失败', data, e.message);
      fail++;
    }
  }
  alert(`导入完成：成功 ${ok} 条，失败 ${fail} 条`);
}

async function deleteRow(tableId, docId) {
  if (!confirm('确认删除？')) return;
  await db.deleteDocument(CONFIG.DATABASE_ID, tableId, docId);
  loadCurrentTab();
}
window.deleteRow = deleteRow;

/* ==================== 工单管理 ==================== */

const WO_HEADERS = ['wo_number', 'product_name', 'plan_qty', 'status'];

async function loadWorkOrders() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.wo);
  document.querySelector('#wo-table tbody').innerHTML = res.documents.map(d => {
    const isCompleted = d.status === 'completed';
    const actionCell = isCompleted
      ? `<span style="color:#999;font-size:13px;">已完成（不可修改）</span>`
      : `<button onclick="openEditWO('${d.$id}')">编辑</button>`;
    return `
      <tr>
        <td>${d.wo_number}</td>
        <td>${d.product_name}</td>
        <td>${d.plan_qty}</td>
        <td>${d.status}</td>
        <td>${actionCell}</td>
      </tr>`;
  }).join('');
}

document.getElementById('wo-import').onclick = () => document.getElementById('wo-file-input').click();
document.getElementById('wo-file-input').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);
  await batchImport(CONFIG.TABLES.wo, headers, rows);
  loadWorkOrders();
  e.target.value = '';
};
document.getElementById('wo-export').onclick = async () => {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.wo);
  const rows = res.documents.map(d => WO_HEADERS.map(h => d[h] ?? ''));
  exportCSV(WO_HEADERS, rows, 'work_orders');
};

/* 新增工单弹窗 */
const woModal = document.getElementById('wo-modal');
const woErr = document.getElementById('wo-form-error');

document.getElementById('wo-add').onclick = () => {
  document.getElementById('wo-form-number').value = '';
  document.getElementById('wo-form-product').value = '';
  document.getElementById('wo-form-qty').value = '';
  document.getElementById('wo-form-status').value = 'pending';
  woErr.textContent = '';
  woModal.classList.remove('hidden');
};

document.getElementById('wo-form-cancel').onclick = () => {
  woModal.classList.add('hidden');
};

document.getElementById('wo-form-save').onclick = async () => {
  const wo_number = document.getElementById('wo-form-number').value.trim();
  const product_name = document.getElementById('wo-form-product').value.trim();
  const plan_qty = parseInt(document.getElementById('wo-form-qty').value, 10);
  const status = document.getElementById('wo-form-status').value;

  if (!wo_number || !product_name || !plan_qty) {
    woErr.textContent = '工单号、产品名称、计划数量必填';
    return;
  }

  try {
    await db.createDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.wo, ID.unique(), {
      wo_number, product_name, plan_qty, status
    });
    woModal.classList.add('hidden');
    loadWorkOrders();
  } catch (e) {
    woErr.textContent = '保存失败：' + (e.message || e);
  }
};

/* 编辑工单弹窗 */
const woEditModal = document.getElementById('wo-edit-modal');
const woEditErr = document.getElementById('wo-edit-error');

window.openEditWO = async function (docId) {
  try {
    const doc = await db.getDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.wo, docId);
    if (doc.status === 'completed') {
      alert('该工单已完成，不允许修改。');
      return;
    }
    document.getElementById('wo-edit-id').value = doc.$id;
    document.getElementById('wo-edit-number').value = doc.wo_number || '';
    document.getElementById('wo-edit-product').value = doc.product_name || '';
    document.getElementById('wo-edit-qty').value = doc.plan_qty || '';
    document.getElementById('wo-edit-status').value = doc.status || 'pending';
    woEditErr.textContent = '';
    woEditModal.classList.remove('hidden');
  } catch (e) {
    alert('读取工单失败：' + e.message);
  }
};

document.getElementById('wo-edit-cancel').onclick = () => {
  woEditModal.classList.add('hidden');
};

document.getElementById('wo-edit-save').onclick = async () => {
  const docId = document.getElementById('wo-edit-id').value;
  const product_name = document.getElementById('wo-edit-product').value.trim();
  const plan_qty = parseInt(document.getElementById('wo-edit-qty').value, 10);
  const status = document.getElementById('wo-edit-status').value;

  if (!product_name || !plan_qty) {
    woEditErr.textContent = '产品名称和计划数量必填';
    return;
  }

  try {
    const current = await db.getDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.wo, docId);
    if (current.status === 'completed') {
      woEditErr.textContent = '该工单已完成，不允许修改。';
      setTimeout(() => {
        woEditModal.classList.add('hidden');
        loadWorkOrders();
      }, 1200);
      return;
    }

    await db.updateDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.wo, docId, {
      product_name, plan_qty, status
    });
    woEditModal.classList.add('hidden');
    loadWorkOrders();
  } catch (e) {
    woEditErr.textContent = '保存失败：' + (e.message || e);
  }
};

/* ==================== BOM管理 ==================== */

const BOM_HEADERS = ['product_number', 'version', 'part_number', 'part_name', 'unit_qty'];

async function loadBOM() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.bom);
  document.querySelector('#bom-table tbody').innerHTML = res.documents.map(d => `
    <tr>
      <td>${d.product_number || ''}</td>
      <td>${d.version || ''}</td>
      <td>${d.part_number || ''}</td>
      <td>${d.part_name || ''}</td>
      <td>${d.unit_qty ?? ''}</td>
      <td><button onclick="deleteRow('${CONFIG.TABLES.bom}','${d.$id}')">删除</button></td>
    </tr>`).join('');
}

document.getElementById('bom-import').onclick = () => document.getElementById('bom-file-input').click();
document.getElementById('bom-file-input').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);
  await batchImport(CONFIG.TABLES.bom, headers, rows);
  loadBOM();
  e.target.value = '';
};
document.getElementById('bom-export').onclick = async () => {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.bom);
  const rows = res.documents.map(d => BOM_HEADERS.map(h => d[h] ?? ''));
  exportCSV(BOM_HEADERS, rows, 'bom_items');
};

/* ==================== 物料信息 ==================== */

const MATERIAL_HEADERS = ['part_number', 'part_name', 'spec'];

async function loadMaterials() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.material);
  document.querySelector('#material-table tbody').innerHTML = res.documents.map(d => `
    <tr>
      <td>${d.part_number || ''}</td>
      <td>${d.part_name || ''}</td>
      <td>${d.spec || ''}</td>
      <td><button onclick="deleteRow('${CONFIG.TABLES.material}','${d.$id}')">删除</button></td>
    </tr>`).join('');
}

document.getElementById('material-import').onclick = () => {
  document.getElementById('material-file-input').click();
};
document.getElementById('material-file-input').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);
  await batchImport(CONFIG.TABLES.material, headers, rows);
  loadMaterials();
  e.target.value = '';
};
document.getElementById('material-export').onclick = async () => {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.material);
  const rows = res.documents.map(d => MATERIAL_HEADERS.map(h => d[h] ?? ''));
  exportCSV(MATERIAL_HEADERS, rows, 'materials');
};

/* ==================== 工单发料 ==================== */

const ISSUE_HEADERS = ['wo_number', 'part_number', 'issue_qty', 'operator', 'issued_at'];

async function loadIssues() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.issue);
  document.querySelector('#issue-table tbody').innerHTML = res.documents.map(d => `
    <tr>
      <td>${d.wo_number || ''}</td>
      <td>${d.part_number || ''}</td>
      <td>${d.issue_qty ?? ''}</td>
      <td>${d.operator || ''}</td>
      <td>${d.issued_at || ''}</td>
      <td><button onclick="deleteRow('${CONFIG.TABLES.issue}','${d.$id}')">删除</button></td>
    </tr>`).join('');
}

document.getElementById('issue-import').onclick = () => document.getElementById('issue-file-input').click();
document.getElementById('issue-file-input').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);
  await batchImport(CONFIG.TABLES.issue, headers, rows);
  loadIssues();
  e.target.value = '';
};
document.getElementById('issue-export').onclick = async () => {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.issue);
  const rows = res.documents.map(d => ISSUE_HEADERS.map(h => d[h] ?? ''));
  exportCSV(ISSUE_HEADERS, rows, 'issue_records');
};

/* ==================== 工单退料 ==================== */

const RETURN_HEADERS = ['wo_number', 'part_number', 'return_qty', 'operator', 'returned_at'];

async function loadReturns() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.return);
  document.querySelector('#return-table tbody').innerHTML = res.documents.map(d => `
    <tr>
      <td>${d.wo_number || ''}</td>
      <td>${d.part_number || ''}</td>
      <td>${d.return_qty ?? ''}</td>
      <td>${d.operator || ''}</td>
      <td>${d.returned_at || ''}</td>
      <td><button onclick="deleteRow('${CONFIG.TABLES.return}','${d.$id}')">删除</button></td>
    </tr>`).join('');
}

document.getElementById('return-import').onclick = () => document.getElementById('return-file-input').click();
document.getElementById('return-file-input').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);
  await batchImport(CONFIG.TABLES.return, headers, rows);
  loadReturns();
  e.target.value = '';
};
document.getElementById('return-export').onclick = async () => {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.return);
  const rows = res.documents.map(d => RETURN_HEADERS.map(h => d[h] ?? ''));
  exportCSV(RETURN_HEADERS, rows, 'return_records');
};

/* ==================== 损耗计算 ==================== */

async function calcLoss() {
  const [woRes, issueRes, returnRes] = await Promise.all([
    db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.wo),
    db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.issue),
    db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.return)
  ]);

  const results = [];

  for (const wo of woRes.documents) {
    const woNum = wo.wo_number;

    const issueMap = {};
    issueRes.documents
      .filter(d => d.wo_number === woNum)
      .forEach(d => {
        issueMap[d.part_number] = (issueMap[d.part_number] || 0) + (Number(d.issue_qty) || 0);
      });

    const returnMap = {};
    returnRes.documents
      .filter(d => d.wo_number === woNum)
      .forEach(d => {
        returnMap[d.part_number] = (returnMap[d.part_number] || 0) + (Number(d.return_qty) || 0);
      });

    const partNumbers = new Set([...Object.keys(issueMap), ...Object.keys(returnMap)]);

    for (const partNum of partNumbers) {
      const issueQty = issueMap[partNum] || 0;
      const returnQty = returnMap[partNum] || 0;
      const netIssue = issueQty - returnQty;

      results.push({
        wo_number: woNum,
        part_number: partNum,
        total_issue: issueQty.toFixed(2),
        total_return: returnQty.toFixed(2),
        net_issue: netIssue.toFixed(2)
      });
    }
  }

  return results;
}

document.getElementById('loss-calc').onclick = async () => {
  const results = await calcLoss();
  if (!results.length) return alert('无数据');
  const headers = Object.keys(results[0]);

  document.querySelector('#loss-table thead').innerHTML =
    '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
  document.querySelector('#loss-table tbody').innerHTML =
    results.map(r => `<tr>${headers.map(h => `<td>${r[h]}</td>`).join('')}</tr>`).join('');
};

document.getElementById('loss-export').onclick = async () => {
  const results = await calcLoss();
  if (!results.length) return alert('无数据');
  const headers = Object.keys(results[0]);
  exportCSV(headers, results.map(r => headers.map(h => r[h])), 'loss_report');
};

/* ==================== Tab 切换 ==================== */

const loaders = {
  wo: loadWorkOrders,
  bom: loadBOM,
  material: loadMaterials, 
  issue: loadIssues,
  return: loadReturns
};

function loadCurrentTab() {
  const active = document.querySelector('nav button.active');
  if (!active) return;
  if (loaders[active.dataset.tab]) loaders[active.dataset.tab]();
}
window.loadCurrentTab = loadCurrentTab;

document.querySelectorAll('nav button').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    loadCurrentTab();
  };
});
