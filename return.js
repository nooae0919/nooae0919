let db = null;

window.onAuthReady = function () {
  db = initDB(window.AppwriteClient);
  loadReturns();
};

const RETURN_HEADERS = ['wo_number', 'part_number', 'return_qty', 'operator', 'returned_at'];

async function loadReturns() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.return);
  renderTable('#return-table tbody', res.documents, RETURN_HEADERS, (d) =>
    `<button onclick="deleteReturnRow('${d.$id}')">删除</button>`
  );
}

window.deleteReturnRow = function (docId) {
  deleteRow(db, CONFIG.TABLES.return, docId, loadReturns);
};

document.getElementById('return-import').onclick = () => document.getElementById('return-file-input').click();
document.getElementById('return-file-input').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);
  await batchImport(db, CONFIG.TABLES.return, headers, rows);
  loadReturns();
  e.target.value = '';
};

document.getElementById('return-export').onclick = async () => {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.return);
  const rows = res.documents.map(d => RETURN_HEADERS.map(h => d[h] ?? ''));
  exportCSV(RETURN_HEADERS, rows, 'return_records');
};