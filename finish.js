let db = null;

window.onAuthReady = function () {
  db = initDB(window.AppwriteClient);
  loadFinishSummary();
};

/* 加载工单列表 + 每个工单的入库汇总 */
async function loadFinishSummary() {
  const [woRes, finishRes] = await Promise.all([
    db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.wo, [
      Appwrite.Query.limit(500)
    ]),
    db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.finish, [
      Appwrite.Query.limit(5000)
    ])
  ]);

  // 按工单号汇总入库数量
  const summaryMap = {};   // wo_number -> totalQty
  finishRes.documents.forEach(d => {
    const wo = d.wo_number;
    if (!wo) return;
    if (!summaryMap[wo]) summaryMap[wo] = 0;
    summaryMap[wo] += Number(d.finish_qty) || 0;
  });

  const tbody = document.querySelector('#finish-table tbody');
  tbody.innerHTML = woRes.documents.map(wo => {
    const planQty = Number(wo.plan_qty) || 0;
    const finishedQty = summaryMap[wo.wo_number] || 0;
    const remainQty = Math.max(planQty - finishedQty, 0);
    const percent = planQty > 0 ? Math.min(Math.round(finishedQty / planQty * 100), 100) : 0;

    const statusText = wo.status === 'completed' ? '已完成'
                     : wo.status === 'in_progress' ? '生产中'
                     : '待生产';

    // 进度条颜色
    const barColor = percent >= 100 ? '#16a34a' : percent > 0 ? '#2563eb' : '#e5e7eb';
    const progressHtml = `
      <div style="display:flex;align-items:center;gap:8px;min-width:140px;">
        <div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
          <div style="width:${percent}%;height:100%;background:${barColor};transition:width .3s;"></div>
        </div>
        <span style="font-size:12px;color:#666;min-width:36px;">${percent}%</span>
      </div>`;

    return `
      <tr>
        <td>${wo.wo_number || ''}</td>
        <td>${wo.product_number || ''}</td>
        <td>${wo.product_name || ''}</td>
        <td>${planQty}</td>
        <td style="color:#2563eb;font-weight:600;">${finishedQty}</td>
        <td style="color:${remainQty > 0 ? '#d33' : '#16a34a'};font-weight:600;">${remainQty}</td>
        <td>${progressHtml}</td>
        <td>${statusText}</td>
        <td>
          <button onclick="openFinishDetail('${encodeURIComponent(wo.wo_number)}')">
            查看明细
          </button>
        </td>
      </tr>`;
  }).join('');
}

/* 跳转到明细页 */
window.openFinishDetail = function (woNumberEncoded) {
  const woNumber = decodeURIComponent(woNumberEncoded);
  window.location.href = `finish-detail.html?wo=${encodeURIComponent(woNumber)}`;
};

/* 导出全部入库记录 */
document.getElementById('finish-export-all').onclick = async () => {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.finish, [
    Appwrite.Query.limit(5000)
  ]);
  const headers = ['wo_number', 'product_number', 'finish_qty', 'operator', 'finished_at'];
  const rows = res.documents.map(d => headers.map(h => d[h] ?? ''));
  exportCSV(headers, rows, 'finish_records_all');
};

/* 刷新 */
document.getElementById('finish-refresh').onclick = () => loadFinishSummary();
