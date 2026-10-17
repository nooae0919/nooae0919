import { CONFIG } from '../config.js';
import { listDocs, createDoc, updateDoc } from './db.js';
import { Query } from 'appwrite';

// 内存局部缓存（只存已经查过的，避免反复查）
let localCache = {};

/** 同步取名称（如果在缓存里） */
export function partName(part_number) {
  if (!part_number) return '';
  return localCache[part_number] || '';
}

/** 
 * ⭐ 核心改造：针对当前页的料号，一次性批量拉取名称 
 * 传入当前页记录数组，自动提取料号去重并查询
 */
export async function loadPartNamesForPage(docs, fieldName = 'part_number') {
  if (!docs || !docs.length) return;
  
  // 提取当前页所有不重复的料号
  const pns = [...new Set(docs.map(d => d[fieldName]).filter(Boolean))];
  if (!pns.length) return;

  // 过滤掉已经缓存过的
  const needFetch = pns.filter(pn => !localCache[pn]);
  if (!needFetch.length) return; // 全都缓存过了，直接返回

  // Appwrite 每次最多查 100 个，这里分批查
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
      
      // 查不到的料号（说明主数据里没有），也记为空，防止下次重复查
      chunk.forEach(pn => {
        if (localCache[pn] === undefined) localCache[pn] = '';
      });
    } catch (e) {
      console.error('拉取物料名称失败', e);
    }
  }
}

/** 清空缓存（用于主数据修改后刷新） */
export function clearPartCache() {
  localCache = {};
}

/** 按料号精确查一个（未命中则回源查库） */
export async function getPart(part_number) {
  if (!part_number) return null;
  if (localCache[part_number]) {
    // 注意：localCache 里只存了 name，如果要完整对象还得查
  }
  const res = await listDocs(CONFIG.TABLES.part, [
    Query.equal('part_number', part_number),
    Query.limit(1),
  ]);
  if (!res.documents.length) return null;
  localCache[part_number] = res.documents[0].part_name || '';
  return res.documents[0];
}

/** 新增/确保存在：不存在则创建 */
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
