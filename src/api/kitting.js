import { CONFIG } from '../config.js';
import { listDocs, createDoc, updateDoc, deleteDoc } from './db.js';
import { Query } from 'appwrite';

/* ============ 工具：延迟 ============ */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ============ 并发批量执行器 ============ */
/**
 * 把 items 分批并发执行 fn，每批 concurrency 个，批间 delayMs 毫秒
 * @param {Array} items 待处理数组
 * @param {Function} fn 对单个 item 执行 async 操作
 * @param {Object} opts { concurrency, delayMs, onProgress }
 */
async function batchRun(items, fn, opts = {}) {
  const {
    concurrency = 5,
    delayMs = 1200,
    onProgress = null
  } = opts;

  const total = items.length;
  let done = 0, ok = 0, fail = 0;
  const errors = [];

  const chunks = [];
  for (let i = 0; i < total; i += concurrency) {
    chunks.push(items.slice(i, i + concurrency));
  }

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    await Promise.all(chunk.map(async (item) => {
      try {
        await fn(item);
        ok++;
      } catch (e) {
        fail++;
        errors.push(e.message || String(e));
      } finally {
        done++;
      }
    }));
    if (onProgress) onProgress({ done, total, ok, fail });
    if (ci < chunks.length - 1) await sleep(delayMs);
  }

  return { ok, fail, errors };
}

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

  // 2. BOM 快照（只查指定料号，减少数据量）
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

  // 已查出的现有超发库存
  const existingRes = await listDocs(CONFIG.TABLES.inventory, [
    Query.equal('source_wo', woNumber),
    Query.limit(5000)
  ]);
  const existingMap = {};
  existingRes.documents.forEach(d => {
    existingMap[d.part_number] = d;
  });

  // 工单不是"生产中" → 清除全部
  if (wo.status !== 'in_progress') {
    let removed = 0;
    const toDelete = existingRes.documents.filter(doc => {
      if (partNumbers && partNumbers.length) {
        return partNumbers.includes(doc.part_number);
      }
      return true;
    });
    if (toDelete.length) {
      const res = await batchRun(
        toDelete,
        doc => deleteDoc(CONFIG.TABLES.inventory, doc.$id),
        { concurrency: 5, delayMs: 800 }
      );
      removed = res.ok;
    }
    return { action: 'clear', removed };
  }

  if (!wo.line) return { action: 'skip', reason: 'no-line' };

  // 逐料号同步
  const toCreate = [];
  const toUpdate = [];
  const toRemove = [];

  for (const r of allRows) {
    const existing = existingMap[r.part_number];
    if (r.excess > 0) {
      if (existing) {
        if (Number(existing.quantity) !== r.excess || existing.location !== wo.line) {
          toUpdate.push({ id: existing.$id, data: {
            quantity: r.excess,
            location: wo.line,
            part_name: r.part_name
          }});
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

  if (toRemove.length) {
    const res = await batchRun(
      toRemove,
      id => deleteDoc(CONFIG.TABLES.inventory, id),
      { concurrency: 5, delayMs: 800 }
    );
    removed = res.ok;
  }
  if (toUpdate.length) {
    const res = await batchRun(
      toUpdate,
      item => updateDoc(CONFIG.TABLES.inventory, item.id, item.data),
      { concurrency: 5, delayMs: 800 }
    );
    updated = res.ok;
  }
  if (toCreate.length) {
    const res = await batchRun(
      toCreate,
      data => createDoc(CONFIG.TABLES.inventory, data),
      { concurrency: 5, delayMs: 800 }
    );
    created = res.ok;
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
 *  BOM → 工单快照（并发批量，解决 131 条限流）
 *  可选 onProgress 回调 { phase, done, total }
 * ============================================================ */
export async function snapshotBomToWo(bomId, woNumber, onProgress) {
  // 1. 先删旧快照
  const oldRes = await listDocs(CONFIG.TABLES.woBom, [
    Query.equal('wo_number', woNumber),
    Query.limit(5000)
  ]);
  let removed = 0;
  if (oldRes.documents.length) {
    const res = await batchRun(
      oldRes.documents,
      it => deleteDoc(CONFIG.TABLES.woBom, it.$id),
      {
        concurrency: 5,
        delayMs: 1000,
        onProgress: p => onProgress && onProgress({ phase: 'delete', ...p })
      }
    );
    removed = res.ok;
  }

  // 2. 拉 BOM 头（取版本）
  const bomRes = await listDocs(CONFIG.TABLES.bom, [
    Query.equal('$id', bomId),
    Query.limit(1)
  ]);
  const bomVersion = bomRes.documents[0]?.version || '';

  // 3. 拉 BOM 明细
  const itemRes = await listDocs(CONFIG.TABLES.bomItem, [
    Query.equal('bom_id', bomId),
    Query.limit(5000)
  ]);

  // 4. 并发写入快照
  const items = itemRes.documents.map(it => ({
    wo_number: woNumber,
    part_number: it.part_number,
    part_name: it.part_name || '',
    qty_per_board: Number(it.qty_per_board) || 0,
    bom_version: bomVersion,
    source_bom_id: bomId
  }));

  let ok = 0;
  if (items.length) {
    const res = await batchRun(
      items,
      data => createDoc(CONFIG.TABLES.woBom, data),
      {
        concurrency: 5,
        delayMs: 1000,
        onProgress: p => onProgress && onProgress({ phase: 'create', ...p })
      }
    );
    ok = res.ok;
  }

  return { ok, removed, bomVersion, total: items.length };
}
