let db = null;
let summaryRows = [];      // 缓存汇总结果
let initialized = false;   // 防止重复初始化

/* ==================== 初始化保障 ==================== */

function ensureDB() {
  if (!db && window.AppwriteClient) {
    db = initDB(window.AppwriteClient);
  }
  return db;
}

function initPage() {
  if (initialized) return;
  if (!ensureDB()) return;   // client 还没准备好，等下次
  initialized = true;
  loadSummary();
}

/* login.js 登录后会调用它 */
window.onAuthReady = initPage;

/* 兜底 1：DOM 加载完后试一次 */
document.addEventListener('DOMContentLoaded', () => setTimeout(initPage, 0));

/* 兜底 2：50ms 后再试一次（如果 login.js 是异步的） */
setTimeout(initPage, 50);

/* ==================== 业务逻辑 ==================== */

/* 从 inventory 集合拉取所有数据并聚合 */
async function loadSummary() {
  if (!db) return;   // 极端情况下的保护

  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.inventory, [
    Appwrite.Query.limit(5000)
  ]);

  // 按料号聚合
  const map = {};   // part_number -> { part_name, total, locations }
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
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;">暂无库存数据</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r, idx) => `
    <tr>
      <td>${idx + 1}</td>
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

/* 搜索按钮 */
document.getElementById('sum-search-btn').onclick = applyFilters;

/* 清空按钮 */
document.getElementById('sum-clear-btn').onclick = () => {
  document.getElementById('sum-search').value = '';
  applyFilters();
};

/* 输入即时过滤 */
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
