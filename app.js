const { Databases, Query, ID } = Appwrite;

let db = null;

// 登录成功后由 login.js 调用
window.onAuthReady = function () {
  db = new Databases(window.AppwriteClient);
  loadWorkOrders();
};

// ==================== 通用工具 ====================

function exportCSV(headers, rows, filename) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0,10)}.csv`);
}

function readCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      resolve({ headers: data[0], rows: data.slice(1) });
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

async function batchImport(tableId, headers, rows) {
  let ok = 0, fail = 0;
  for (const row of rows) {
    const data = {};
    headers.forEach((h, i) => { if (row[i] !== undefined) data[h] = row[i]; });
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

// ==================== 工单 ====================

const WO_HEADERS = ['wo_number', 'product_name', 'plan_qty', 'status'];

async function loadWorkOrders() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.wo);
  document.querySelector('#wo-table tbody').innerHTML = res.documents.map(d => `
    <tr>
      <td>${d.wo_number}</td>
      <td>${d.product_name}</td>
      <td>${d.plan_qty}</td>
      <td>${d.status}</td>
      <td><button onclick="deleteRow('${CONFIG.TABLES.wo}','${d.$id}')">删除</button></td>
    </tr>`).join('');
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
  exportCSV(WO_HEADERS, res.documents.map(d => WO_HEADERS.map(h => d[h] ?? '')), 'work_orders');
};

// ==================== BOM ====================

const BOM_HEADERS = ['wo_number', 'part_number', 'part_name', 'unit_qty', 'loss_rate'];

async function loadBOM() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.bom);
  document.querySelector('#bom-table tbody').innerHTML = res.documents.map(d => `
    <tr>
      <td>${d.wo_number}</td><td>${d.part_number}</td><td>${d.part_name}</td>
      <td>${d.unit_qty}</td><td>${d.loss_rate}</td>
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
  exportCSV(BOM_HEADERS, res.documents.map(d => BOM_HEADERS.map(h => d[h] ?? '')), 'bom_items');
};

// ==================== 发料 ====================

const ISSUE_HEADERS = ['wo_number', 'part_number', 'issue_qty', 'operator', 'issued_at'];

async function loadIssues() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.issue);
  document.querySelector('#issue-table tbody').innerHTML = res.documents.map(d => `
    <tr>
      <td>${d.wo_number}</td><td>${d.part_number}</td><td>${d.issue_qty}</td>
      <td>${d.operator}</td><td>${d.issued_at}</td>
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
  exportCSV(ISSUE_HEADERS, res.documents.map(d => ISSUE_HEADERS.map(h => d[h] ?? '')), 'issue_records');
};

// ==================== 退料 ====================

const RETURN_HEADERS = ['wo_number', 'part_number', 'return_qty', 'operator', 'returned_at'];

async function loadReturns() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.return);
  document.querySelector('#return-table tbody').innerHTML = res.documents.map(d => `
    <tr>
      <td>${d.wo_number}</td><td>${d.part_number}</td><td>${d.return_qty}</td>
      <td>${d.operator}</td><td>${d.returned_at}</td>
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
  exportCSV(RETURN_HEADERS, res.documents.map(d => RETURN_HEADERS.map(h => d[h] ?? '')), 'return_records');
};

// ==================== 损耗计算 ====================

async function calcLoss() {
  const woRes = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.wo);
  const results = [];

  for (const wo of woRes.documents) {
    const woNum = wo.wo_number;
    const planQty = Number(wo.plan_qty) || 0;

    const [bomRes, issueRes, returnRes] = await Promise.all([
      db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.bom, [Query.equal('wo_number', woNum)]),
      db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.issue, [Query.equal('wo_number', woNum)]),
      db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.return, [Query.equal('wo_number', woNum)])
    ]);

    for (const bom of bomRes.documents) {
      const partNum = bom.part_number;
      const unitQty = Number(bom.unit_qty) || 0;
      const stdLossRate = Number(bom.loss_rate) || 0.003;

      const shouldConsume = planQty * unitQty;
      const stdLossQty = shouldConsume * stdLossRate;

      const actualIssue = issueRes.documents
        .filter(d => d.part_number === partNum)
        .reduce((s, d) => s + (Number(d.issue_qty) || 0), 0);

      const actualReturn = returnRes.documents
        .filter(d => d.part_number === partNum)
        .reduce((s, d) => s + (Number(d.return_qty) || 0), 0);

      const actualLoss = actualIssue - shouldConsume - actualReturn;
      const lossDiff = actualLoss - stdLossQty;
      const actualLossRate = actualIssue > 0 ? (actualLoss / actualIssue) * 100 : 0;

      results.push({
        wo_number: woNum,
        part_number: partNum,
        plan_qty: planQty,
        unit_qty: unitQty,
        should_consume: shouldConsume.toFixed(2),
        std_loss_rate: (stdLossRate * 100).toFixed(2) + '%',
        std_loss_qty: stdLossQty.toFixed(2),
        actual_issue: actualIssue.toFixed(2),
        actual_return: actualReturn.toFixed(2),
        actual_loss: actualLoss.toFixed(2),
        loss_diff: lossDiff.toFixed(2),
        actual_loss_rate: actualLossRate.toFixed(3) + '%'
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
  document.querySelector('#loss-table tbody').innerHTML = results.map(r => `
    <tr class="${parseFloat(r.loss_diff) > 0 ? 'danger' : ''}">
      ${headers.map(h => `<td>${r[h]}</td>`).join('')}
    </tr>`).join('');
};

document.getElementById('loss-export').onclick = async () => {
  const results = await calcLoss();
  if (!results.length) return alert('无数据');
  const headers = Object.keys(results[0]);
  exportCSV(headers, results.map(r => headers.map(h => r[h])), 'loss_report');
};

// ==================== Tab 切换 ====================

const loaders = {
  wo: loadWorkOrders,
  bom: loadBOM,
  issue: loadIssues,
  return: loadReturns
};

function loadCurrentTab() {
  const active = document.querySelector('nav button.active').dataset.tab;
  if (loaders[active]) loaders[active]();
}

document.querySelectorAll('nav button').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    loadCurrentTab();
  };
});

// ==================== 新增工单弹窗 ====================

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
      wo_number,
      product_name,
      plan_qty,
      status
    });
    woModal.classList.add('hidden');
    loadWorkOrders();
  } catch (e) {
    woErr.textContent = '保存失败：' + (e.message || e);
  }
};
