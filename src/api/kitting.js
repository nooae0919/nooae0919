import { CONFIG } from '../config.js';
import { listDocs, createDoc, updateDoc, deleteDoc } from './db.js';
import { Query } from 'appwrite';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 计算某个工单的超发明细 */
export async function computeExcess(woNumber) {
  const woRes = await listDocs(CONFIG.TABLES.wo, [
    Query.equal('wo_number', woNumber),
    Query.limit(1)
  ]);
  if (!woRes.documents.length) return null;
  const wo = woRes.documents[0];
  if (!wo.bom_id) return null;

  const bomItemRes = await listDocs(CONFIG.TABLES.bomItem, [
    Query.equal('bom_id', wo.bom_id),
    Query.limit(20000)
  ]);

  const issueRes = await listDocs(CONFIG.TABLES.issue, [
    Query.equal('wo_number', woNumber),
    Query.limit(20000)
  ]);
  const issueMap = {};
  issueRes.documents.forEach(d => {
    const pn = d.part_number; if (!pn) return;
    issueMap[pn] = (issueMap[pn] || 0) + (Number(d.issue_qty) || 0);
  });

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
 * @param {string} woNumber 工单号
 * @param {string[]} [partNumbers] 可选，只同步这些料号；不传则全量
 * 规则：
 *  - 工单状态 != in_progress  → 删除该工单贡献的所有超发库存
 *  - 工单状态 == in_progress  → 每个料号：
 *      超发 > 0  → 新增/更新一条 source_wo=工单号、location=线体 的记录
 *      超发 <= 0 → 删除该料号的超发库存
 */
export async function syncExcessToInventory(woNumber, partNumbers) {
  const computed = await computeExcess(woNumber);
  if (!computed) return { action: 'skip', reason: 'no-wo-or-bom' };
  const { wo, rows: allRows } = computed;

  // 只处理指定料号
  const rows = partNumbers && partNumbers.length
    ? allRows.filter(r => partNumbers.includes(r.part_number))
    : allRows;

  // 查出该工单现有的超发库存记录
  const existingRes = await listDocs(CONFIG.TABLES.inventory, [
    Query.equal('source_wo', woNumber),
    Query.limit(5000)
  ]);
  const existingMap = {};
  existingRes.documents.forEach(d => {
    existingMap[d.part_number] = d;
  });

  // 工单不是"生产中" → 删除该工单的全部超发库存
  if (wo.status !== 'in_progress') {
    let removed = 0;
    for (const doc of existingRes.documents) {
      // 如果限定了料号列表，也一并清掉这些料号的记录
      if (partNumbers && partNumbers.length && !partNumbers.includes(doc.part_number)) continue;
      await deleteDoc(CONFIG.TABLES.inventory, doc.$id);
      removed++;
      await sleep(30);
    }
    return { action: 'clear', removed };
  }

  if (!wo.line) return { action: 'skip', reason: 'no-line' };

  let created = 0, updated = 0, removed = 0;

  for (const r of rows) {
    const existing = existingMap[r.part_number];

    if (r.excess > 0) {
      if (existing) {
        // 有则更新
        if (Number(existing.quantity) !== r.excess || existing.location !== wo.line) {
          await updateDoc(CONFIG.TABLES.inventory, existing.$id, {
            quantity: r.excess,
            location: wo.line,
            part_name: r.part_name
          });
          updated++;
          await sleep(30);
        }
      } else {
        // 无则新增
        await createDoc(CONFIG.TABLES.inventory, {
          part_number: r.part_number,
          part_name: r.part_name,
          quantity: r.excess,
          location: wo.line,
          source_wo: woNumber
        });
        created++;
        await sleep(30);
      }
    } else {
      // 超发 <= 0 → 删除该料号的超发库存
      if (existing) {
        await deleteDoc(CONFIG.TABLES.inventory, existing.$id);
        removed++;
        await sleep(30);
      }
    }
  }

  return { action: 'sync', created, updated, removed };
}

/** 工单状态变化时调用（全量） */
export async function onWoStatusChanged(woNumber) {
  return syncExcessToInventory(woNumber);   // 不传 partNumbers → 全量
}
