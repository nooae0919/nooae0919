let db = null;
let currentWoNumber = null;
let currentWoDoc = null;
let currentIssues = [];

/* 从 URL 参数里取工单号 */
function getWoNumberFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('wo');
}

window.onAuthReady = async function () {
  db = initDB(window.AppwriteClient);

  currentWoNumber = getWoNumberFromUrl();
  if (!currentWoNumber) {
    alert('未指定工单号');
    location.href = 'issue.html';
    return;
  }

  await loadWoInfo();
  await loadIssues();

  // 绑定导入导出
  document.getElementById('detail-import').onclick = () =>
    document.getElementById('detail-file-input').click();
  document.getElementById('detail-file-input').onchange = handleImport;
  document.getElementById('detail-export').onclick = handleExport;
};

/* 加载工单信息 */
async function loadWoInfo() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.wo, [
    Appwrite.Query.equal('wo_number', currentWoNumber),
    Appwrite.Query.limit(1)
  ]);
  if (!res.documents.length) {
    alert('未找到该工单');
    location.href = 'issue.html';
    return;
  }
  currentWoDoc = res.documents[0];

  document.getElementById('wo-title').textContent = `工单 ${currentWoDoc.wo_number}`;
  document.getElementById('wo-product-number').textContent = currentWoDoc.product_number || '-';
  document.getElementById('wo-product-name').textContent = currentWoDoc.product_name || '-';
  document.getElementById('wo-plan-qty').textContent = currentWoDoc.plan_qty ?? '-';
  document.getElementById('wo-produce-date').textContent = currentWoDoc.produce_date || '-';
  document.getElementById('wo-status').textContent =
    currentWoDoc.status === 'completed' ? '已完成'
    : currentWoDoc.status === 'in_progress' ? '生产中'
    : '待生产';
}

/* 加载该工单的领料记录 */
async function loadIssues() {
  const res = await db.listDocuments(CONFIG.DATABASE_ID, CONFIG.TABLES.issue, [
    Appwrite.Query.equal('wo_number', currentWoNumber),
    Appwrite.Query.orderDesc('issue_time'),
    Appwrite.Query.limit(5000)
  ]);
  currentIssues = res.documents;
  renderDetailTable();
  renderSummaryTable();
}

/* 渲染明细表 */
function renderDetailTable() {
  document.querySelector('#detail-table tbody').innerHTML = currentIssues.map(d => `
    <tr>
      <td>${d.part_number || ''}</td>
      <td>${d.part_name || ''}</td>
      <td>${d.issue_qty ?? ''}</td>
      <td>${d.operator || ''}</td>
      <td>${d.issue_time || ''}</td>
      <td><button onclick="deleteDetailRow('${d.$id}')">删除</button></td>
    </tr>`).join('');
}

/* 渲染汇总表 */
function renderSummaryTable() {
  const map = {};   // part_number -> { part_name, total }
  currentIssues.forEach(d => {
    const key = d.part_number || '';
    if (!map[key]) map[key] = { part_name: d.part_name || '', total: 0 };
    map[key].total += Number(d.issue_qty) || 0;
  });
  const rows = Object.entries(map).map(([part_number, v]) => `
    <tr>
      <td>${part_number}</td>
      <td>${v.part_name}</td>
      <td><b>${v.total}</b></td>
    </tr>`).join('');
  document.querySelector('#summary-table tbody').innerHTML =
    rows || '<tr><td colspan="3" style="text-align:center;color:#999;">暂无领料记录</td></tr>';
}

/* 删除一条领料记录 */
window.deleteDetailRow = async function (docId) {
  if (!confirm('确认删除该领料记录？')) return;
  try {
    await db.deleteDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.issue, docId);
    await loadIssues();
  } catch (e) {
    alert('删除失败：' + e.message);
  }
};

/* 导入 CSV（自动绑定到当前工单） */
async function handleImport(e) {
  const f = e.target.files[0];
  if (!f) return;

  const { headers, rows } = await readCSV(f);

  // 如果 CSV 里没有 wo_number 列，就自动补上当前工单号
  const hasWoCol = headers.includes('wo_number');

  let ok = 0, fail = 0;
  for (const row of rows) {
    const data = {};
    headers.forEach((h, i) => {
      const v = row[i];
      if (v === undefined || v === null || v === '') return;
      if (h === 'issue_qty') {
        const n = Number(v);
        if (isNaN(n)) return;
        data[h] = n;
      } else {
        data[h] = String(v).trim();
      }
    });
    // 强制使用当前工单号，避免导入错单
    data.wo_number = currentWoNumber;

    try {
      await db.createDocument(CONFIG.DATABASE_ID, CONFIG.TABLES.issue, ID.unique(), data);
      ok++;
    } catch (err) {
      console.error('导入失败', data, err.message);
      fail++;
    }
  }
  alert(`导入完成：成功 ${ok} 条，失败 ${fail} 条`);
  await loadIssues();
  e.target.value = '';
}

/* 导出当前工单的领料记录 */
function handleExport() {
  const headers = ['wo_number', 'part_number', 'part_name', 'issue_qty', 'operator', 'issue_time'];
  const rows = currentIssues.map(d => headers.map(h => d[h] ?? ''));
  exportCSV(headers, rows, `issue_${currentWoNumber}`);
}
