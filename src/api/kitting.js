import { CONFIG } from '../config.js';
import { listDocs, createDoc, updateDoc, deleteDoc } from './db.js';
import { Query } from 'appwrite';

/* ============ 工具 ============ */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 每条操作之间的间隔（毫秒），用于规避 Appwrite 限流
   60ms → 每秒约 16 条，安全；如遇 429 调到 100~150 */
const STEP_DELAY = 60;

/* ============================================================
 *  计算工单超发明细（可传 partNumbers 只查指定料号）
 * ============================================================ */
export async function computeExcess(woNumber, partNumbers) {
  // 1. 工单
  const woRes = await listDocs(CONFIG.TABLES.wo, [
    Query.equal('wo_number', woNumber),
    Query.limit(1)
  ]);
  if (!woRes.documents.length) return null;
  const wo = woRes.documents[0];

  // 2. BOM 快照（只查指定料号）
  const snapQueries = [
    Query.equal('wo_number', woNumber),
    Query.limit(2000)
  ];
  if (partNumbers && partNumbers.length) {
    snapQueries.push(Query.equal('part_number', partNumbers));
  }
  const snapRes = await listDocs(CONFIG.TABLES.woBom, snapQueries);

  // 3. 领料（只查指定料号）
  const issueQueries = [
    Query.equal('wo_number', woNumber),
    Query.limit(2000)
  ];
  if (partNumbers && partNumbers.length) {
    issueQueries.push(Query.equal('part_number', partNumbers));
  }
  const issueRes = await listDocs(CONFIG.TABLES.issue, issueQueries);

  // 4. 汇总领料
  const issueMap = {};
  issueRes.documents.forEach(d => {
    const pn = d.part_number; if (!pn) return;
    issueMap[pn] = (issueMap[pn] || 0) + (Number(d.issue_qty) || 0);
  });

  // 5. 计算超发
  const planQty = Number(wo.plan_qty) || 0;
  const rows = snapRes.documents.map(it => {
    const per = Number(it.qty_per_board) || 0;
    const required = Math.ceil(per * planQty);
    const issued = issueMap[it.part_number] || 0;
    const excess = issued - required;
    return {
      part_number: it.part_number,
      part_name: it.part_name || '',
      qty_per_board: per,
      required,
      issued,
      excess
    };
  });

  return { wo, rows };
}

/* ============================================================
 *  同步超发到库存
 *  - 工单状态 != in_progress → 清除该工单的超发库存
 *  - 工单状态 == in_progress → 逐料号新增/更新/删除
 *  - partNumbers 可选，只处理指定料号
 * ============================================================ */
export async function syncExcessToInventory(woNumber, partNumbers) {
  const computed = await computeExcess(woNumber, partNumbers);
  if (!computed) return { action: 'skip', reason: 'no-wo' };
  const { wo, rows: allRows } = computed;

  // 已存在的超发库存记录
  const existingRes = await listDocs(CONFIG.TABLES.inventory, [
    Query.equal('source_wo', woNumber),
    Query.limit(5000)
  ]);
  const existingMap = {};
  existingRes.documents.forEach(d => {
    existingMap[d.part_number] = d;
  });

  // 工单不是"生产中" → 清除全部（或指定料号）
  if (wo.status !== 'in_progress') {
    const toDelete = existingRes.documents.filter(doc => {
      if (partNumbers && partNumbers.length) {
        return partNumbers.includes(doc.part_number);
      }
      return true;
    });
    let removed = 0;
    for (const doc of toDelete) {
      try {
        await deleteDoc(CONFIG.TABLES.inventory, doc.$id);
        removed++;
      } catch (e) {
        console.error('删除超发库存失败', doc.$id, e.message);
      }
      await sleep(STEP_DELAY);
    }
    return { action: 'clear', removed };
  }

  if (!wo.line) return { action: 'skip', reason: 'no-line' };

  // 分类：新增 / 更新 / 删除
  const toCreate = [];
  const toUpdate = [];
  const toRemove = [];

  for (const r of allRows) {
    const existing = existingMap[r.part_number];
    if (r.excess > 0) {
      if (existing) {
        if (Number(existing.quantity) !== r.excess || existing.location !== wo.line) {
          toUpdate.push({
            id: existing.$id,
            data: { quantity: r.excess, location: wo.line, part_name: r.part_name }
          });
        }
      } else {
        toCreate.push({
          part_number: r.part_number,
          part_name: r.part_name,
          quantity: r.excess,
          location: wo.line,
          source_wo: woNumber
        });
      }
    } else {
      if (existing) toRemove.push(existing.$id);
    }
  }

  let created = 0, updated = 0, removed = 0;

  // 顺序删除
  for (const id of toRemove) {
    try { await deleteDoc(CONFIG.TABLES.inventory, id); removed++; }
    catch (e) { console.error(e.message); }
    await sleep(STEP_DELAY);
  }
  // 顺序更新
  for (const item of toUpdate) {
    try { await updateDoc(CONFIG.TABLES.inventory, item.id, item.data); updated++; }
    catch (e) { console.error(e.message); }
    await sleep(STEP_DELAY);
  }
  // 顺序创建
  for (const data of toCreate) {
    try { await createDoc(CONFIG.TABLES.inventory, data); created++; }
    catch (e) { console.error(e.message); }
    await sleep(STEP_DELAY);
  }

  return { action: 'sync', created, updated, removed };
}

/* ============================================================
 *  工单状态变化时同步（全量）
 * ============================================================ */
export async function onWoStatusChanged(woNumber) {
  return syncExcessToInventory(woNumber);
}

/* ============================================================
 *  BOM → 工单快照
 *  1. 顺序删除旧快照（每条 60ms）
 *  2. 拉 BOM 明细，按料号合并数量
 *  3. 顺序写入新快照（每条 60ms）
 *
 *  onProgress({ phase, done, total, ok, fail })
 *    phase: 'delete' | 'create'
 * ============================================================ */
export async function snapshotBomToWo(bomId, woNumber, onProgress) {
  // ---------- 1. 拉旧快照并顺序删除 ----------
  const oldRes = await listDocs(CONFIG.TABLES.woBom, [
    Query.equal('wo_number', woNumber),
    Query.limit(5000)
  ]);

  let removed = 0;
  const oldTotal = oldRes.documents.length;

  for (let i = 0; i < oldTotal; i++) {
    const it = oldRes.documents[i];
    try {
      await deleteDoc(CONFIG.TABLES.woBom, it.$id);
      removed++;
    } catch (e) {
      console.error('删除旧快照失败', it.$id, e.message);
    }
    if (onProgress) {
      onProgress({
        phase: 'delete',
        done: i + 1,
        total: oldTotal,
        ok: removed,
        fail: i + 1 - removed
      });
    }
    await sleep(STEP_DELAY);
  }

  // ---------- 2. 拉 BOM 头 ----------
  const bomRes = await listDocs(CONFIG.TABLES.bom, [
    Query.equal('$id', bomId),
    Query.limit(1)
  ]);
  const bomVersion = bomRes.documents[0]?.version || '';

  // ---------- 3. 拉 BOM 明细，按料号合并 ----------
  const itemRes = await listDocs(CONFIG.TABLES.bomItem, [
    Query.equal('bom_id', bomId),
    Query.limit(5000)
  ]);

  const merged = {};
  itemRes.documents.forEach(it => {
    const pn = String(it.part_number || '').trim();
    if (!pn) return;
    if (!merged[pn]) {
      merged[pn] = { part_number: pn, part_name: it.part_name || '', qty_per_board: 0 };
    }
    merged[pn].qty_per_board += Number(it.qty_per_board) || 0;
  });
  const items = Object.values(merged).map(m => ({
    wo_number: woNumber,
    part_number: m.part_number,
    part_name: m.part_name,
    qty_per_board: m.qty_per_board,
    bom_version: bomVersion,
    source_bom_id: bomId
  }));

  // ---------- 4. 顺序写入新快照 ----------
  let ok = 0, fail = 0;
  const total = items.length;

  for (let i = 0; i < total; i++) {
    try {
      await createDoc(CONFIG.TABLES.woBom, items[i]);
      ok++;
    } catch (e) {
      console.error('写入快照失败', items[i].part_number, e.message);
      fail++;
    }
    if (onProgress) {
      onProgress({
        phase: 'create',
        done: i + 1,
        total,
        ok,
        fail
      });
    }
    await sleep(STEP_DELAY);
  }

  return {
    ok,                 // 成功写入条数
    removed,            // 成功删除旧条数
    bomVersion,
    total,              // 最终快照条数（合并后）
    originalCount: itemRes.documents.length,   // BOM 原始明细条数
    fail                // 写入失败条数
  };
}
