import { CONFIG } from '../config.js';
import { listDocs, createDoc, updateDoc } from './db.js';
import { Query } from 'appwrite';

let localCache = {};

export function partName(part_number) {
  if (!part_number) return '';
  return localCache[part_number] || '';
}

export async function loadPartNamesForPage(docs, fieldName = 'part_number') {
  if (!docs || !docs.length) return;
  
  const pns = [...new Set(docs.map(d => d[fieldName]).filter(Boolean))];
  if (!pns.length) return;

  const needFetch = pns.filter(pn => !localCache[pn]);
  if (!needFetch.length) return;

  const chunkSize = 100;
  for (let i = 0; i < needFetch.length; i += chunkSize) {
    const chunk = needFetch.slice(i, i + chunkSize);
    try {
      const res = await listDocs(CONFIG.TABLES.part, [
        Query.equal('part_number', chunk),
        Query.limit(chunkSize)
      ]);
      res.documents.forEach(d => {
        localCache[d.part_number] = d.part_name || '';
      });
      chunk.forEach(pn => {
        if (localCache[pn] === undefined) localCache[pn] = '';
      });
    } catch (e) {
      console.error('拉取物料名称失败', e);
    }
  }
}

export function clearPartCache() {
  localCache = {};
}

export async function getPart(part_number) {
  if (!part_number) return null;
  const res = await listDocs(CONFIG.TABLES.part, [
    Query.equal('part_number', part_number),
    Query.limit(1),
  ]);
  if (!res.documents.length) return null;
  localCache[part_number] = res.documents[0].part_name || '';
  return res.documents[0];
}

export async function ensurePart(part_number, part_name = '') {
  if (!part_number) return null;
  const exist = await getPart(part_number);
  if (exist) {
    if (part_name && !exist.part_name) {
      const updated = await updateDoc(CONFIG.TABLES.part, exist.$id, { part_name });
      localCache[part_number] = updated.part_name;
      return updated;
    }
    return exist;
  }
  const created = await createDoc(CONFIG.TABLES.part, {
    part_number,
    part_name: part_name || '',
  });
  localCache[part_number] = created.part_name;
  return created;
}
