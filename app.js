// CSV 导出
function exportCSV(headers, rows, filename) {
  const wsData = [headers, ...rows];
  const csv = '\uFEFF' + XLSX.utils.sheet_to_csv(
    XLSX.utils.aoa_to_sheet(wsData)
  );
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// CSV 读取
function readCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      let text = e.target.result;
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
      const parseRow = (line) => {
        const cells = [];
        let cur = '', inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (inQuote) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') { inQuote = false; }
            else { cur += ch; }
          } else {
            if (ch === '"') { inQuote = true; }
            else if (ch === ',') { cells.push(cur); cur = ''; }
            else { cur += ch; }
          }
        }
        cells.push(cur);
        return cells;
      };
      const headers = parseRow(lines[0]);
      const rows = lines.slice(1).map(parseRow);
      resolve({ headers, rows });
    };
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');
  });
}

// 数字字段配置
const NUMERIC_FIELDS = {
  [CONFIG.TABLES.wo]: ['plan_qty'],
  [CONFIG.TABLES.issue]: ['issue_qty'],
  [CONFIG.TABLES.return]: ['return_qty'],
  [CONFIG.TABLES.finish]: ['finish_qty']
};

// 批量导入
async function batchImport(db, tableId, headers, rows) {
  const numericKeys = NUMERIC_FIELDS[tableId] || [];
  let ok = 0, fail = 0;
  for (const row of rows) {
    const data = {};
    headers.forEach((h, i) => {
      const v = row[i];
      if (v === undefined || v === null || v === '') return;
      if (numericKeys.includes(h)) {
        const n = Number(v);
        if (isNaN(n)) return;
        data[h] = n;
      } else {
        data[h] = String(v).trim();
      }
    });
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

// 删除行
async function deleteRow(db, tableId, docId, reloadFn) {
  if (!confirm('确认删除？')) return;
  await db.deleteDocument(CONFIG.DATABASE_ID, tableId, docId);
  if (reloadFn) reloadFn();
}

// 初始化数据库
function initDB(client) {
  return new Appwrite.Databases(client);
}

// 渲染通用表格
function renderTable(tbodySelector, docs, columns, actionsFn) {
  document.querySelector(tbodySelector).innerHTML = docs.map(d => `
    <tr>
      ${columns.map(c => `<td>${d[c] ?? ''}</td>`).join('')}
      <td>${actionsFn ? actionsFn(d) : ''}</td>
    </tr>`).join('');
}