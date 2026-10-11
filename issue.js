let db = null;

window.onAuthReady = function () {
  db = initDB(window.AppwriteClient);
  loadIssueSummary();
};

/* 加载工单列表 + 每个工单的领料汇总 */
async function loadIssueSummary() {
  // 并发拉取：工单、领料记录
  const [woRes, issueRes] = await Promise.all([
    db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.wo, [
      Appwrite.Query.limit(500)
    ]),
    db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.issue, [
      Appwrite.Query.limit(5000)
    ])
  ]);

  // 按工单号汇总领料记录
  const summaryMap = {};   // wo_number -> { partCount, totalQty }
  issueRes.documents.forEach(d => {
    const wo = d.wo_number;
    if (!wo) return;
    if (!summaryMap[wo]) summaryMap[wo] = { partSet: new Set(), totalQty: 0 };
    summaryMap[wo].partSet.add(d.part_number);
    summaryMap[wo].totalQty += Number(d.issue_qty) || 0;
  });

  // 渲染工单行
  const tbody = document.querySelector('#issue-table tbody');
  tbody.innerHTML = woRes.documents.map(wo => {
    const s = summaryMap[wo.wo_number];
    const partCount = s ? s.partSet.size : 0;
    const totalQty = s ? s.totalQty : 0;
    const statusText = wo.status === 'completed' ? '已完成'
                     : wo.status === 'in_progress' ? '生产中'
                     : '待生产';
    return `
      <tr>
        <td>${wo.wo_number || ''}</td>
        <td>${wo.product_number || ''}</td>
        <td>${wo.product_name || ''}</td>
        <td>${wo.plan_qty ?? ''}</td>
        <td>${partCount}</td>
        <td>${totalQty}</td>
        <td>${statusText}</td>
        <td>
          <button onclick="openIssueDetail('${encodeURIComponent(wo.wo_number)}')">
            查看明细
          </button>
        </td>
      </tr>`;
  }).join('');
}

/* 跳转到明细页 */
window.openIssueDetail = function (woNumberEncoded) {
  const woNumber = decodeURIComponent(woNumberEncoded);
  window.location.href = `issue-detail.html?wo=${encodeURIComponent(woNumber)}`;
};

/* 导出全部领料记录 */
document.getElementById('issue-export-all').onclick = async () => {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.issue, [
    Appwrite.Query.limit(5000)
  ]);
  const headers = ['wo_number', 'part_number', 'part_name', 'issue_qty', 'operator', 'issue_time'];
  const rows = res.documents.map(d => headers.map(h => d[h] ?? ''));
  exportCSV(headers, rows, 'issue_records_all');
};

/* 刷新 */
document.getElementById('issue-refresh').onclick = () => loadIssueSummary();
