import { CONFIG } from '../config.js';
import { listDocs, createDoc, updateDoc, deleteDoc } from './db.js';
import { Query } from 'appwrite';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 计算某个工单的超发明细（基于 wo_bom 快照） */
export async function computeExcess(woNumber) {
  const woRes = await listDocs(CONFIG.TABLES.wo, [
    Query.equal('wo_number', woNumber),
    Query.limit(1)
  ]);
  if (!woRes.documents.length) return null;
  const wo = woRes.documents[0];

  // ⭐ 用料明细从 wo_bom 快照拿，不再查 bom_item
  const snapRes = await listDocs(CONFIG.TABLES.woBom, [
    Query.equal('wo_number', woNumber),
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

/** 同步超发到库存 */
export async function syncExcessToInventory(woNumber, partNumbers) {
  const computed = await computeExcess(woNumber);
  if (!computed) return { action: 'skip', reason: 'no-wo' };
  const { wo, rows: allRows } = computed;

  const rows = partNumbers && partNumbers.length
    ? allRows.filter(r => partNumbers.includes(r.part_number))
    : allRows;

  const existingRes = await listDocs(CONFIG.TABLES.inventory, [
    Query.equal('source_wo', woNumber),
    Query.limit(5000)
  ]);
  const existingMap = {};
  existingRes.documents.forEach(d => {
    existingMap[d.part_number] = d;
  });

  if (wo.status !== 'in_progress') {
    let removed = 0;
    for (const doc of existingRes.documents) {
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
      if (existing) {
        await deleteDoc(CONFIG.TABLES.inventory, existing.$id);
        removed++;
        await sleep(30);
      }
    }
  }
  return { action: 'sync', created, updated, removed };
}

export async function onWoStatusChanged(woNumber) {
  return syncExcessToInventory(woNumber);
}

/** ⭐ 工具函数：把 BOM 明细复制为工单快照 */
export async function snapshotBomToWo(bomId, woNumber) {
  // 先删旧的（用于"重新载入 BOM"）
  const oldRes = await listDocs(CONFIG.TABLES.woBom, [
    Query.equal('wo_number', woNumber),
    Query.limit(20000)
  ]);
  for (const it of oldRes.documents) {
    await deleteDoc(CONFIG.TABLES.woBom, it.$id);
    await sleep(20);
  }

  // 拉 BOM
  const bomRes = await listDocs(CONFIG.TABLES.bom, [
    Query.equal('$id', bomId), Query.limit(1)
  ]);
  const bomVersion = bomRes.documents[0]?.version || '';

  const itemRes = await listDocs(CONFIG.TABLES.bomItem, [
    Query.equal('bom_id', bomId),
    Query.limit(20000)
  ]);

  let ok = 0;
  for (const it of itemRes.documents) {
    await createDoc(CONFIG.TABLES.woBom, {
      wo_number: woNumber,
      part_number: it.part_number,
      part_name: it.part_name || '',
      qty_per_board: Number(it.qty_per_board) || 0,
      bom_version: bomVersion,
      source_bom_id: bomId
    });
    ok++;
    await sleep(20);   // 节流
  }
  return { ok, bomVersion };
}
