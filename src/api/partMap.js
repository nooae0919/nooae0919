import { CONFIG } from '../config.js';
import { listDocs, createDoc, updateDoc } from './db.js';
import { Query } from 'appwrite';

/**
 * 物料主数据缓存（全局单例）
 * key: part_number  value: { part_name, spec, unit, ... }
 */
let cache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

/** 强制刷新缓存 */
export async function refreshPartCache() {
  const all = [];
  let offset = 0;
  const chunk = 500;
  while (true) {
    const res = await listDocs(CONFIG.TABLES.part, [
      Query.orderAsc('part_number'),
      Query.limit(chunk),
      Query.offset(offset),
    ]);
    all.push(...res.documents);
    if (res.documents.length < chunk) break;
    offset += chunk;
  }
  const map = {};
  all.forEach(p => {
    if (p.part_number) map[p.part_number] = p;
  });
  cache = map;
  cacheTime = Date.now();
  return map;
}

/** 获取（带缓存） */
export async function getPartMap(force = false) {
  if (force || !cache || Date.now() - cacheTime > CACHE_TTL) {
    await refreshPartCache();
  }
  return cache;
}

/** 同步取名称（需先 await getPartMap 预热） */
export function partName(part_number) {
  if (!cache || !part_number) return '';
  return cache[part_number]?.part_name || '';
}

/** 批量取名称映射：{ pn: name } */
export function partNameMap(partNumbers) {
  const m = {};
  if (!cache) return m;
  partNumbers.forEach(pn => {
    if (cache[pn]) m[pn] = cache[pn].part_name;
  });
  return m;
}

/** 按料号精确查一个（未命中则回源查库） */
export async function getPart(part_number) {
  if (!part_number) return null;
  const m = await getPartMap();
  if (m[part_number]) return m[part_number];
  const res = await listDocs(CONFIG.TABLES.part, [
    Query.equal('part_number', part_number),
    Query.limit(1),
  ]);
  if (!res.documents.length) return null;
  m[part_number] = res.documents[0];
  return m[part_number];
}

/** 新增/确保存在：不存在则创建（用于领料/入库时自动补料号） */
export async function ensurePart(part_number, part_name = '') {
  if (!part_number) return null;
  const exist = await getPart(part_number);
  if (exist) {
    // 如果传入名称且主数据为空，顺手补上
    if (part_name && !exist.part_name) {
      const updated = await updateDoc(CONFIG.TABLES.part, exist.$id, { part_name });
      if (cache) cache[part_number] = updated;
      return updated;
    }
    return exist;
  }
  const created = await createDoc(CONFIG.TABLES.part, {
    part_number,
    part_name: part_name || '',
  });
  if (cache) cache[part_number] = created;
  return created;
}
