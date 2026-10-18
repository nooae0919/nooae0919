import { CONFIG } from '../config.js';
import { listDocs, createDoc, updateDoc, deleteDoc } from './db.js';
import { Query } from 'appwrite';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const STEP_DELAY = 150;

export async function computeExcess(woNumber, partNumbers) {
  const woRes = await listDocs(CONFIG.TABLES.wo, [
    Query.equal('wo_number', woNumber),
    Query.limit(1)
  ]);
  if (!woRes.documents.length) return null;
  const wo = woRes.documents[0];

  const snapQueries = [
    Query.equal('wo_number', woNumber),
    Query.limit(200)
  ];
  if (partNumbers && partNumbers.length) {
    snapQueries.push(Query.equal('part_number', partNumbers));
  }
  const snapRes = await listDocs(CONFIG.TABLES.woBom, snapQueries);

  const issueQueries = [
    Query.equal('wo_number', woNumber),
    Query.limit(200)
  ];
  if (partNumbers && partNumbers.length) {
    issueQueries.push(Query.equal('part_number', partNumbers));
  }
  const issueRes = await listDocs(CONFIG.TABLES.issue, issueQueries);

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
      qty_per_board: per,
      required,
      issued,
      excess
    };
  });

  return { wo, rows };
}

export async function syncExcessToInventory(woNumber, partNumbers) {
  const computed = await computeExcess(woNumber, partNumbers);
  if (!computed) return { action: 'skip', reason: 'no-wo' };
  const { wo, rows: allRows } = computed;

  const existingRes = await listDocs(CONFIG.TABLES.inventory, [
    Query.equal('source_wo', woNumber),
    Query.limit(200)
  ]);
  const existingMap = {};
  existingRes.documents.forEach(d => {
    existingMap[d.part_number] = d;
  });

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
            data: { quantity: r.excess, location: wo.line }
          });
        }
      } else {
        toCreate.push({
          part_number: r.part_number,
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

  for (const id of toRemove) {
    try { await deleteDoc(CONFIG.TABLES.inventory, id); removed++; }
    catch (e) { console.error(e.message); }
    await sleep(STEP_DELAY);
  }
  for (const item of toUpdate) {
    try { await updateDoc(CONFIG.TABLES.inventory, item.id, item.data); updated++; }
    catch (e) { console.error(e.message); }
    await sleep(STEP_DELAY);
  }
  for (const data of toCreate) {
    try { await createDoc(CONFIG.TABLES.inventory, data); created++; }
    catch (e) { console.error(e.message); }
    await sleep(STEP_DELAY);
  }

  return { action: 'sync', created, updated, removed };
}

export async function onWoStatusChanged(woNumber) {
  return syncExcessToInventory(woNumber);
}

export async function snapshotBomToWo(bomId, woNumber, onProgress) {
  const oldRes = await listDocs(CONFIG.TABLES.woBom, [
    Query.equal('wo_number', woNumber),
    Query.limit(200)
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

  const bomRes = await listDocs(CONFIG.TABLES.bom, [
    Query.equal('$id', bomId),
    Query.limit(1)
  ]);
  const bomVersion = bomRes.documents[0]?.version || '';

  const itemRes = await listDocs(CONFIG.TABLES.bomItem, [
    Query.equal('bom_id', bomId),
    Query.limit(200)
  ]);

  const merged = {};
  itemRes.documents.forEach(it => {
    const pn = String(it.part_number || '').trim();
    if (!pn) return;
    if (!merged[pn]) {
      merged[pn] = { part_number: pn, qty_per_board: 0 };
    }
    merged[pn].qty_per_board += Number(it.qty_per_board) || 0;
  });
  const items = Object.values(merged).map(m => ({
    wo_number: woNumber,
    part_number: m.part_number,
    qty_per_board: m.qty_per_board,
    bom_version: bomVersion,
    source_bom_id: bomId
  }));

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
    ok,
    removed,
    bomVersion,
    total,
    originalCount: itemRes.documents.length,
    fail
  };
}
