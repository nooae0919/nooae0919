let db = null;

window.onAuthReady = function () {
  db = initDB(window.AppwriteClient);
  loadWorkOrders();
};

const WO_HEADERS = ['wo_number', 'product_name', 'plan_qty', 'status'];

async function loadWorkOrders() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.wo);
  renderTable('#wo-table tbody', res.documents, WO_HEADERS, (d) => {
    if (d.status === 'completed') {
      return `<span style="color:#999;font-size:13px;">已完成（不可修改）</span>`;
    }
    return `<button onclick="openEditWO('${d.$id}')">编辑</button>`;
  });
}

// 导入
document.getElementById('wo-import').onclick = () => document.getElementById('wo-file-input').click();
document.getElementById('wo-file-input').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);
  await batchImport(db, CONFIG.TABLES.wo, headers, rows);
  loadWorkOrders();
  e.target.value = '';
};

// 导出
document.getElementById('wo-export').onclick = async () => {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.wo);
  const rows = res.documents.map(d => WO_HEADERS.map(h => d[h] ?? ''));
  exportCSV(WO_HEADERS, rows, 'work_orders');
};

// 新增工单
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

document.getElementById('wo-form-cancel').onclick = () => woModal.classList.add('hidden');

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

// 编辑工单
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

document.getElementById('wo-edit-cancel').onclick = () => woEditModal.classList.add('hidden');

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