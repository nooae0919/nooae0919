import { CONFIG } from '../config.js';
import { listDocs, createDoc, updateDoc, deleteDoc } from './db.js';
import { Query } from 'appwrite';

/** 计算某个工单的超发明细：part_number -> { excess, part_name } */
export async function computeExcess(woNumber) {
  // 1. 拿工单
  const woRes = await listDocs(CONFIG.TABLES.wo, [
    Query.equal('wo_number', woNumber),
    Query.limit(1)
  ]);
  if (!woRes.documents.length) return null;
  const wo = woRes.documents[0];
  if (!wo.bom_id) return null;

  // 2. BOM 明细
  const bomItemRes = await listDocs(CONFIG.TABLES.bomItem, [
    Query.equal('bom_id', wo.bom_id),
    Query.limit(20000)
  ]);

  // 3. 领料汇总
  const issueRes = await listDocs(CONFIG.TABLES.issue, [
    Query.equal('wo_number', woNumber),
    Query.limit(20000)
  ]);
  const issueMap = {};
  issueRes.documents.forEach(d => {
    const pn = d.part_number; if (!pn) return;
    issueMap[pn] = (issueMap[pn] || 0) + (Number(d.issue_qty) || 0);
  });

  // 4. 计算超发
  const planQty = Number(wo.plan_qty) || 0;
  const rows = bomItemRes.documents.map(it => {
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

/**
 * 同步某个工单的超发到库存
 * 规则：
 *  - 工单状态 != in_progress  → 删除该工单贡献的所有超发库存
 *  - 工单状态 == in_progress  → 每个料号：
 *      超发 > 0  → 新增/更新一条 source_wo=工单号、location=线体 的记录
 *      超发 <= 0 → 删除该料号的超发库存
 */
export async function syncExcessToInventory(woNumber) {
  const computed = await computeExcess(woNumber);
  if (!computed) return { action: 'skip', reason: 'no-wo-or-bom' };
  const { wo, rows } = computed;

  // 先查出该工单所有的超发库存记录
  const existingRes = await listDocs(CONFIG.TABLES.inventory, [
    Query.equal('source_wo', woNumber),
    Query.limit(5000)
  ]);
  const existingMap = {};
  existingRes.documents.forEach(d => {
    existingMap[d.part_number] = d;   // 该工单 + 该料号 的库存记录
  });

  // 工单不是"生产中" → 删除全部
  if (wo.status !== 'in_progress') {
    let removed = 0;
    for (const doc of existingRes.documents) {
      await deleteDoc(CONFIG.TABLES.inventory, doc.$id);
      removed++;
    }
    return { action: 'clear', removed };
  }

  // 工单是"生产中" → 逐料号同步
  if (!wo.line) {
    return { action: 'skip', reason: 'no-line' };
  }

  let created = 0, updated = 0, removed = 0;

  for (const r of rows) {
    const existing = existingMap[r.part_number];
    if (r.excess > 0) {
      if (existing) {
        // 更新（数量变了）
        if (Number(existing.quantity) !== r.excess || existing.location !== wo.line) {
          await updateDoc(CONFIG.TABLES.inventory, existing.$id, {
            quantity: r.excess,
            location: wo.line,
            part_name: r.part_name
          });
          updated++;
        }
      } else {
        // 新增
        await createDoc(CONFIG.TABLES.inventory, {
          part_number: r.part_number,
          part_name: r.part_name,
          quantity: r.excess,
          location: wo.line,
          source_wo: woNumber
        });
        created++;
      }
    } else {
      // 超发 <= 0，如果之前有，删掉
      if (existing) {
        await deleteDoc(CONFIG.TABLES.inventory, existing.$id);
        removed++;
      }
    }
  }

  return { action: 'sync', created, updated, removed };
}

/** 当工单状态变化时调用（切到非生产中 → 清空；切回生产中 → 重建） */
export async function onWoStatusChanged(woNumber) {
  return syncExcessToInventory(woNumber);
}
