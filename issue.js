let db = null;

window.onAuthReady = function () {
  db = initDB(window.AppwriteClient);
  loadIssues();
};

const ISSUE_HEADERS = ['wo_number', 'part_number', 'part_name', 'issue_qty', 'operator', 'issue_time'];

async function loadIssues() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.issue);
  renderTable('#issue-table tbody', res.documents, ISSUE_HEADERS, (d) =>
    `<button onclick="deleteIssueRow('${d.$id}')">删除</button>`
  );
}

window.deleteIssueRow = function (docId) {
  deleteRow(db, CONFIG.TABLES.issue, docId, loadIssues);
};

document.getElementById('issue-import').onclick = () => document.getElementById('issue-file-input').click();
document.getElementById('issue-file-input').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);
  await batchImport(db, CONFIG.TABLES.issue, headers, rows);
  loadIssues();
  e.target.value = '';
};

document.getElementById('issue-export').onclick = async () => {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.issue);
  const rows = res.documents.map(d => ISSUE_HEADERS.map(h => d[h] ?? ''));
  exportCSV(ISSUE_HEADERS, rows, 'issue_records');
};
