import { db, ID } from './client.js';
import { CONFIG } from '../config.js';

export function listDocs(tableId, queries = []) {
  return db.listDocuments(CONFIG.DATABASE_ID, tableId, queries);
}
export function getDoc(tableId, docId) {
  return db.getDocument(CONFIG.DATABASE_ID, tableId, docId);
}
export function createDoc(tableId, data, docId = ID.unique()) {
  return db.createDocument(CONFIG.DATABASE_ID, tableId, docId, data);
}
export function updateDoc(tableId, docId, data) {
  return db.updateDocument(CONFIG.DATABASE_ID, tableId, docId, data);
}
export function deleteDoc(tableId, docId) {
  return db.deleteDocument(CONFIG.DATABASE_ID, tableId, docId);
}

export const NUMERIC_FIELDS = {
  [CONFIG.TABLES.wo]: ['plan_qty'],
  [CONFIG.TABLES.issue]: ['issue_qty'],
  [CONFIG.TABLES.return]: ['return_qty'],
  [CONFIG.TABLES.finish]: ['finish_qty']
};

export async function batchImport(tableId, headers, rows) {
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
      await createDoc(tableId, data);
      ok++;
    } catch (e) {
      console.error('导入失败', data, e.message);
      fail++;
    }
  }
  alert(`导入完成：成功 ${ok} 条，失败 ${fail} 条`);
}
