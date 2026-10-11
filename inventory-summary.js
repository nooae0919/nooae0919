let db = null;
let summaryRows = [];   // 缓存汇总结果

window.onAuthReady = function () {
  db = initDB(window.AppwriteClient);
  loadSummary();
};

/* 从 inventory 集合拉取所有数据并聚合 */
async function loadSummary() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.inventory, [
    Appwrite.Query.limit(5000)
  ]);

  // 按料号聚合
  const map = {};   // part_number -> { part_name, total, locationCount }
  res.documents.forEach(d => {
    const key = d.part_number || '';
    if (!key) return;
    if (!map[key]) {
      map[key] = { part_name: d.part_name || '', total: 0, locations: new Set() };
    }
    map[key].total += Number(d.quantity) || 0;
    if (d.location) map[key].locations.add(d.location);
  });

  summaryRows = Object.entries(map).map(([part_number, v]) => ({
    part_number,
    part_name: v.part_name,
    total: v.total,
    locationCount: v.locations.size
  }));

  // 按料号排序
  summaryRows.sort((a, b) => a.part_number.localeCompare(b.part_number));

  applyFilters();
}

/* 应用搜索过滤 */
function applyFilters() {
  const keyword = (document.getElementById('sum-search').value || '').trim().toLowerCase();
  let rows = summaryRows;
  if (keyword) {
    rows = rows.filter(r =>
      r.part_number.toLowerCase().includes(keyword) ||
      r.part_name.toLowerCase().includes(keyword)
    );
  }
  renderTable(rows);
}

/* 渲染表格 */
function renderTable(rows) {
  const tbody = document.querySelector('#sum-table tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#999;">暂无库存数据</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>
        <a class="part-link"
           onclick="goToInventory('${encodeURIComponent(r.part_number)}')">
          ${r.part_number}
        </a>
      </td>
      <td>${r.part_name || ''}</td>
      <td><span class="qty-badge">${r.total}</span></td>
      <td>${r.locationCount}</td>
    </tr>`).join('');
}

/* 点击料号跳转到库存管理 */
window.goToInventory = function (partNumberEncoded) {
  const part = decodeURIComponent(partNumberEncoded);
  window.location.href = `inventory.html?part=${encodeURIComponent(part)}`;
};

/* 搜索 */
document.getElementById('sum-search-btn').onclick = applyFilters;
document.getElementById('sum-clear-btn').onclick = () => {
  document.getElementById('sum-search').value = '';
  applyFilters();
};
document.getElementById('sum-search').addEventListener('input', applyFilters);

/* 刷新 */
document.getElementById('sum-refresh').onclick = loadSummary;

/* 导出汇总 */
document.getElementById('sum-export').onclick = () => {
  if (!summaryRows.length) {
    alert('暂无数据');
    return;
  }
  const headers = ['part_number', 'part_name', 'total_quantity', 'location_count'];
  const rows = summaryRows.map(r => [r.part_number, r.part_name, r.total, r.locationCount]);
  exportCSV(headers, rows, 'inventory_summary');
};
