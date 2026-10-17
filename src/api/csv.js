import * as XLSX from 'xlsx';

export function exportCSV(headers, rows, filename) {
  const wsData = [headers, ...rows];
  const csv = '\uFEFF' + XLSX.utils.sheet_to_csv(
    XLSX.utils.aoa_to_sheet(wsData)
  );
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function readCSV(file) {
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
