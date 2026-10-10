let db = null;

window.onAuthReady = function () {
  db = initDB(window.AppwriteClient);
  loadFinish();
};

const FINISH_HEADERS = ['wo_number', 'product_number', 'finish_qty', 'operator', 'finished_at'];

async function loadFinish() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.finish);
  renderTable('#finish-table tbody', res.documents, FINISH_HEADERS, (d) =>
    `<button onclick="deleteFinishRow('${d.$id}')">删除</button>`
  );
}

window.deleteFinishRow = function (docId) {
  deleteRow(db, CONFIG.TABLES.finish, docId, loadFinish);
};

document.getElementById('finish-import').onclick = () => document.getElementById('finish-file-input').click();
document.getElementById('finish-file-input').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);
  await batchImport(db, CONFIG.TABLES.finish, headers, rows);
  loadFinish();
  e.target.value = '';
};

document.getElementById('finish-export').onclick = async () => {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.finish);
  const rows = res.documents.map(d => FINISH_HEADERS.map(h => d[h] ?? ''));
  exportCSV(FINISH_HEADERS, rows, 'finish_records');
};

/* 新增入库 */
const finishModal = document.getElementById('finish-modal');
const finishErr = document.getElementById('finish-form-error');

document.getElementById('finish-add').onclick = async () => {
  const woSel = document.getElementById('finish-form-wo');
  woSel.innerHTML = '<option value="">-- 请选择工单 --</option>';
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.wo);
  res.documents.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.wo_number;
    opt.textContent = `${d.wo_number} - ${d.product_name}（计划 ${d.plan_qty}）`;
    woSel.appendChild(opt);
  });

  document.getElementById('finish-form-part').value = '';
  document.getElementById('finish-form-qty').value = '';
  document.getElementById('finish-form-operator').value = '';
  finishErr.textContent = '';
  finishModal.classList.remove('hidden');
};

document.getElementById('finish-form-cancel').onclick = () => finishModal.classList.add('hidden');

document.getElementById('finish-form-save').onclick = async () => {
  const product_number = document.getElementById('finish-form-part').value.trim();
  const wo_number = document.getElementById('finish-form-wo').value;
  const finish_qty = parseInt(document.getElementById('finish-form-qty').value, 10);
  const operator = document.getElementById('finish-form-operator').value.trim();

  if (!product_number || !wo_number || !finish_qty) {
    finishErr.textContent = '成品料号、关联工单、入库数量必填';
    return;
  }

  try {
    /* 校验工单 */
    const woList = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.wo, [
      Appwrite.Query.equal('wo_number', wo_number)
    ]);
    if (!woList.documents.length) {
      finishErr.textContent = '未找到对应工单';
      return;
    }
    const wo = woList.documents[0];

    /* 已入库数量 */
    const existing = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.finish, [
      Appwrite.Query.equal('wo_number', wo_number)
    ]);
    const alreadyQty = existing.documents.reduce((s, d) => s + (Number(d.finish_qty) || 0), 0);

    if (alreadyQty + finish_qty > wo.plan_qty) {
      finishErr.textContent = `入库数量超出工单计划数量（已入 ${alreadyQty} / 计划 ${wo.plan_qty}）`;
      return;
    }

    await db.createDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.finish, ID.unique(), {
      wo_number, product_number, finish_qty, operator,
      finished_at: new Date().toISOString()
    });

    /* 累计入库 == 计划数量 → 自动关结工单 */
    if (alreadyQty + finish_qty === wo.plan_qty) {
      await db.updateDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.wo, wo.$id, {
        status: 'completed'
      });
    }

    finishModal.classList.add('hidden');
    loadFinish();
  } catch (e) {
    finishErr.textContent = '保存失败：' + (e.message || e);
  }
};
