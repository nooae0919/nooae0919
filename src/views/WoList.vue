<template>
  <MainLayout>
    <div class="page-header">
      <div class="search-bar">
        <input v-model="keyword" type="text" placeholder="按工单号 / 成品料号 / 名称搜索...">
        <select v-model="lineFilter"
                style="padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">
          <option value="">全部线体</option>
          <option value="1线">1线</option>
          <option value="2线">2线</option>
        </select>
      </div>
      <ActionMenu :items="menuItems" />
    </div>

    <table id="wo-table">
      <thead>
        <tr>
          <th style="width:100px;">线体</th>
          <th>工单号</th>
          <th>成品料号</th>
          <th>成品名称</th>
          <th>BOM版本</th>
          <th>计划数量</th>
          <th>生产日期</th>
          <th style="width:110px;">已入库数量</th>
          <th style="width:110px;">未入库数量</th>
          <th>状态</th>
          <th style="width:280px;">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in filteredDocs" :key="d.$id">
          <td>{{ d.line || '-' }}</td>
          <td>{{ d.wo_number || '' }}</td>
          <td>{{ d.product_number || '' }}</td>
          <td>{{ d.product_name || '' }}</td>
          <td>
            {{ snapshotVersionMap[d.wo_number] || bomVersionMap[d.bom_id] || '-' }}
            <span v-if="!snapshotVersionMap[d.wo_number] && d.bom_id"
                  style="color:#d33;font-size:12px;">(未快照)</span>
          </td>
          <td>{{ d.plan_qty ?? '' }}</td>
          <td>{{ d.produce_date || '' }}</td>
          <td style="color:#2563eb;font-weight:600;">
            {{ finishedMap[d.wo_number] || 0 }}
          </td>
          <td :style="{ color: remainQty(d) > 0 ? '#d33' : '#16a34a', fontWeight: 600 }">
            {{ remainQty(d) }}
          </td>
          <td>{{ statusText(d.status) }}</td>
          <td>
            <button @click="goKitting(d)">齐套状态</button>
            <button v-if="d.status !== 'completed'"
                    @click="reloadBom(d)" style="margin-left:4px;">重载BOM</button>
            <span v-if="d.status === 'completed'"
                  style="color:#999;font-size:13px;margin-left:4px;">已完成</span>
            <button v-else @click="openEdit(d.$id)" style="margin-left:4px;">编辑</button>
          </td>
        </tr>
        <tr v-if="!filteredDocs.length">
          <td colspan="11" style="text-align:center;color:#999;">暂无工单</td>
        </tr>
      </tbody>
    </table>

    <input type="file" accept=".csv" hidden ref="fileInput" @change="handleImport">

    <!-- 新增工单弹窗 -->
    <div v-if="showAdd" class="modal-mask">
      <div class="modal-box">
        <h3>新增工单</h3>

        <label>线体
          <select v-model="form.line">
            <option value="">— 请选择 —</option>
            <option value="1线">1线</option>
            <option value="2线">2线</option>
          </select>
        </label>

        <label>关联 BOM <span style="color:#d33;">*</span>
          <select v-model="form.bom_id" @change="onBomChange('add')">
            <option value="">— 请选择 BOM —</option>
            <option v-for="b in bomList" :key="b.$id" :value="b.$id">
              {{ b.product_number }} / {{ b.product_name }} / {{ b.version }}
            </option>
          </select>
        </label>

        <label>工单号
          <input v-model="form.wo_number" type="text" placeholder="如 WO-2024-0001">
        </label>
        <label>成品料号
          <input :value="form.product_number" type="text" readonly
                 style="background:#f3f4f6;cursor:not-allowed;">
        </label>
        <label>成品名称
          <input :value="form.product_name" type="text" readonly
                 style="background:#f3f4f6;cursor:not-allowed;">
        </label>
        <label>计划数量
          <input v-model.number="form.plan_qty" type="number" placeholder="如 500">
        </label>
        <label>生产日期
          <input v-model="form.produce_date" type="date">
        </label>
        <label>状态
          <select v-model="form.status">
            <option value="pending">待生产</option>
            <option value="in_progress">生产中</option>
            <option value="completed">已完成</option>
          </select>
        </label>

        <p class="error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showAdd = false">取消</button>
          <button class="btn-save" @click="saveAdd">保存</button>
        </div>
      </div>
    </div>

    <!-- 编辑工单弹窗 -->
    <div v-if="showEdit" class="modal-mask">
      <div class="modal-box">
        <h3>编辑工单</h3>

        <label>线体
          <select v-model="editForm.line">
            <option value="">— 请选择 —</option>
            <option value="1线">1线</option>
            <option value="2线">2线</option>
          </select>
        </label>

        <label>关联 BOM <span style="color:#d33;">*</span>
          <select v-model="editForm.bom_id" @change="onBomChange('edit')">
            <option value="">— 请选择 BOM —</option>
            <option v-for="b in bomList" :key="b.$id" :value="b.$id">
              {{ b.product_number }} / {{ b.product_name }} / {{ b.version }}
            </option>
          </select>
        </label>

        <label>工单号
          <input v-model="editForm.wo_number" type="text" disabled>
        </label>
        <label>成品料号
          <input :value="editForm.product_number" type="text" readonly
                 style="background:#f3f4f6;cursor:not-allowed;">
        </label>
        <label>成品名称
          <input :value="editForm.product_name" type="text" readonly
                 style="background:#f3f4f6;cursor:not-allowed;">
        </label>
        <label>计划数量
          <input v-model.number="editForm.plan_qty" type="number">
        </label>
        <label>生产日期
          <input v-model="editForm.produce_date" type="date">
        </label>
        <label>状态
          <select v-model="editForm.status">
            <option value="pending">待生产</option>
            <option value="in_progress">生产中</option>
            <option value="completed">已完成</option>
          </select>
        </label>

        <p class="error">{{ editError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showEdit = false">取消</button>
          <button class="btn-save" @click="saveEdit">保存</button>
        </div>
      </div>
    </div>
  </MainLayout>
</template>

<script setup>
import { ref, onMounted, computed, reactive } from 'vue';
import { useRouter } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import ActionMenu from '../components/ActionMenu.vue';
import { CONFIG } from '../config.js';
import { listDocs, getDoc, createDoc, updateDoc } from '../api/db.js';
import { exportCSV, readCSV } from '../api/csv.js';
import { syncExcessToInventory, snapshotBomToWo } from '../api/kitting.js';
import { Query } from 'appwrite';

const router = useRouter();

const WO_HEADERS = ['wo_number', 'line', 'product_number', 'product_name', 'plan_qty', 'produce_date', 'status'];

const docs = ref([]);
const bomList = ref([]);
const bomMap = ref({});
const bomVersionMap = ref({});
const snapshotVersionMap = ref({});
const finishedMap = ref({});
const keyword = ref('');
const lineFilter = ref('');
const fileInput = ref(null);
const showAdd = ref(false);
const showEdit = ref(false);
const formError = ref('');
const editError = ref('');

const form = reactive({
  bom_id: '', wo_number: '', line: '',
  product_number: '', product_name: '',
  plan_qty: '', produce_date: '', status: 'pending'
});
const editForm = reactive({
  $id: '', bom_id: '', wo_number: '', line: '',
  product_number: '', product_name: '',
  plan_qty: '', produce_date: '', status: 'pending'
});

/* ⭐ 操作菜单 */
const menuItems = computed(() => [
  { label: '新增工单', onClick: openAdd },
  { label: '导入CSV', onClick: triggerImport },
  { label: '导出CSV', onClick: handleExport },
  { label: '批量初始化快照', onClick: batchInitSnapshots }
]);

function statusText(s) {
  return s === 'completed' ? '已完成' : s === 'in_progress' ? '生产中' : '待生产';
}

function remainQty(wo) {
  const plan = Number(wo.plan_qty) || 0;
  const fin = Number(finishedMap.value[wo.wo_number]) || 0;
  return Math.max(plan - fin, 0);
}

async function loadBoms() {
  const res = await listDocs(CONFIG.TABLES.bom, [
    Query.limit(5000),
    Query.orderAsc('product_number')
  ]);
  bomList.value = res.documents;
  const map = {}, vmap = {};
  res.documents.forEach(b => {
    map[b.$id] = b;
    vmap[b.$id] = b.version || '';
  });
  bomMap.value = map;
  bomVersionMap.value = vmap;
}
async function loadSnapshotMap() {
  const res = await listDocs(CONFIG.TABLES.woBom, [Query.limit(50000)]);
  const map = {};
  res.documents.forEach(it => {
    if (!map[it.wo_number]) map[it.wo_number] = it.bom_version || '';
  });
  snapshotVersionMap.value = map;
}
async function loadFinishes() {
  const res = await listDocs(CONFIG.TABLES.finish, [Query.limit(20000)]);
  const map = {};
  res.documents.forEach(d => {
    const wo = d.wo_number; if (!wo) return;
    map[wo] = (map[wo] || 0) + (Number(d.finish_qty) || 0);
  });
  finishedMap.value = map;
}
async function load() {
  const res = await listDocs(CONFIG.TABLES.wo, [Query.limit(5000)]);
  docs.value = res.documents;
}
async function loadAll() {
  await Promise.all([loadBoms(), load(), loadSnapshotMap(), loadFinishes()]);
}
onMounted(loadAll);

const filteredDocs = computed(() => {
  let list = docs.value;
  if (lineFilter.value) list = list.filter(d => d.line === lineFilter.value);
  const kw = keyword.value.trim().toLowerCase();
  if (kw) {
    list = list.filter(d =>
      (d.wo_number || '').toLowerCase().includes(kw) ||
      (d.product_number || '').toLowerCase().includes(kw) ||
      (d.product_name || '').toLowerCase().includes(kw)
    );
  }
  return list;
});

function onBomChange(which) {
  const target = which === 'add' ? form : editForm;
  const b = bomMap.value[target.bom_id];
  if (b) {
    target.product_number = b.product_number || '';
    target.product_name = b.product_name || '';
  } else {
    target.product_number = '';
    target.product_name = '';
  }
}

function openAdd() {
  Object.assign(form, {
    bom_id: '', wo_number: '', line: '',
    product_number: '', product_name: '',
    plan_qty: '', produce_date: '', status: 'pending'
  });
  formError.value = '';
  showAdd.value = true;
}

async function saveAdd() {
  if (!form.line) { formError.value = '请选择线体'; return; }
  if (!form.bom_id) { formError.value = '请先选择关联 BOM'; return; }
  if (!form.wo_number || !form.plan_qty) {
    formError.value = '工单号和计划数量必填';
    return;
  }
  try {
    await createDoc(CONFIG.TABLES.wo, {
      bom_id: form.bom_id,
      wo_number: form.wo_number,
      line: form.line,
      product_number: form.product_number,
      product_name: form.product_name,
      plan_qty: Number(form.plan_qty),
      produce_date: form.produce_date,
      status: form.status
    });
    try { await snapshotBomToWo(form.bom_id, form.wo_number); }
    catch (e) { console.error('写入快照失败', e); }
    try { await syncExcessToInventory(form.wo_number); }
    catch (e) { console.error('同步库存失败', e); }
    showAdd.value = false;
    await loadAll();
  } catch (e) {
    formError.value = '保存失败：' + (e.message || e);
  }
}

async function openEdit(docId) {
  try {
    const doc = await getDoc(CONFIG.TABLES.wo, docId);
    if (doc.status === 'completed') { alert('该工单已完成，不允许修改。'); return; }
    Object.assign(editForm, {
      $id: doc.$id,
      bom_id: doc.bom_id || '',
      wo_number: doc.wo_number || '',
      line: doc.line || '',
      product_number: doc.product_number || '',
      product_name: doc.product_name || '',
      plan_qty: doc.plan_qty || '',
      produce_date: doc.produce_date || '',
      status: doc.status || 'pending'
    });
    editError.value = '';
    showEdit.value = true;
  } catch (e) {
    alert('读取工单失败：' + e.message);
  }
}

async function saveEdit() {
  if (!editForm.line) { editError.value = '请选择线体'; return; }
  if (!editForm.bom_id) { editError.value = '请先选择关联 BOM'; return; }
  if (!editForm.plan_qty) { editError.value = '计划数量必填'; return; }
  try {
    const current = await getDoc(CONFIG.TABLES.wo, editForm.$id);
    if (current.status === 'completed') {
      editError.value = '该工单已完成，不允许修改。';
      setTimeout(() => { showEdit.value = false; loadAll(); }, 1200);
      return;
    }
    const bomChanged = current.bom_id !== editForm.bom_id;
    await updateDoc(CONFIG.TABLES.wo, editForm.$id, {
      bom_id: editForm.bom_id,
      line: editForm.line,
      product_number: editForm.product_number,
      product_name: editForm.product_name,
      plan_qty: Number(editForm.plan_qty),
      produce_date: editForm.produce_date,
      status: editForm.status
    });
    if (bomChanged) {
      const ok = window.$confirm
        ? await window.$confirm({
            title: 'BOM 已更换',
            message: '检测到关联 BOM 已变更，是否用新 BOM 重新生成工单用料快照？'
          })
        : confirm('BOM 已变更，是否重载用料快照？');
      if (ok) {
        try { await snapshotBomToWo(editForm.bom_id, editForm.wo_number); }
        catch (e) { alert('快照更新失败：' + (e.message || e)); }
      }
    }
    try { await syncExcessToInventory(editForm.wo_number); }
    catch (e) { console.error('同步库存失败', e); }
    showEdit.value = false;
    await loadAll();
  } catch (e) {
    editError.value = '保存失败：' + (e.message || e);
  }
}

function goKitting(wo) {
  if (!wo.bom_id) { alert('该工单未关联 BOM，无法做齐套分析。'); return; }
  router.push({ name: 'wo-kitting', params: { woId: wo.$id } });
}

async function reloadBom(wo) {
  if (!wo.bom_id) { alert('该工单未关联 BOM。'); return; }
  const ok = window.$confirm
    ? await window.$confirm({
        title: '重载 BOM 快照',
        message: `工单 ${wo.wo_number} 将用当前 BOM 最新明细覆盖用料快照。\n已有的领料记录不受影响，但齐套/超发会按新快照重算。\n确认继续？`
      })
    : confirm('将用当前 BOM 覆盖工单用料快照，确认继续？');
  if (!ok) return;
  try {
    const res = await snapshotBomToWo(wo.bom_id, wo.wo_number);
    await syncExcessToInventory(wo.wo_number);
    await loadSnapshotMap();
    alert(`BOM 快照已重载，共 ${res.ok} 条明细（版本 ${res.bomVersion || '-'}）。`);
  } catch (e) {
    alert('重载失败：' + (e.message || e));
  }
}

async function batchInitSnapshots() {
  const missing = docs.value.filter(d => d.bom_id && !snapshotVersionMap.value[d.wo_number]);
  if (!missing.length) { alert('所有工单都已有快照，无需初始化。'); return; }
  const ok = window.$confirm
    ? await window.$confirm({
        title: '批量初始化快照',
        message: `共 ${missing.length} 个工单缺少快照，将按各自关联的 BOM 生成。\n过程可能需要几十秒，期间请勿关闭页面。\n确认继续？`
      })
    : confirm(`共 ${missing.length} 个工单缺少快照，确认批量生成？`);
  if (!ok) return;

  let success = 0, fail = 0;
  const errors = [];
  for (const wo of missing) {
    try {
      await snapshotBomToWo(wo.bom_id, wo.wo_number);
      success++;
    } catch (e) {
      errors.push(`${wo.wo_number}: ${e.message || e}`);
      fail++;
    }
  }
  await loadSnapshotMap();
  let msg = `批量初始化完成：成功 ${success} 个，失败 ${fail} 个。`;
  if (errors.length) {
    msg += '\n\n失败明细（前 10 条）：\n' + errors.slice(0, 10).join('\n');
    if (errors.length > 10) msg += `\n...还有 ${errors.length - 10} 条`;
  }
  alert(msg);
}

function triggerImport() { fileInput.value.click(); }

async function handleImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);

  const pnToBom = {};
  bomList.value.forEach(b => { pnToBom[b.product_number] = b.$id; });

  let ok = 0, fail = 0;
  const errors = [];
  const touchedWos = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const data = {};
    headers.forEach((h, idx) => {
      const v = row[idx];
      if (v === undefined || v === null || v === '') return;
      if (h === 'plan_qty') {
        const n = Number(v); if (isNaN(n)) return;
        data[h] = n;
      } else data[h] = String(v).trim();
    });

    if (!data.bom_id && data.product_number) {
      const bid = pnToBom[data.product_number];
      if (bid) data.bom_id = bid;
    }
    if (!data.bom_id) {
      errors.push(`第 ${i+2} 行：找不到匹配的 BOM`);
      fail++; continue;
    }
    if (!data.wo_number) {
      errors.push(`第 ${i+2} 行：工单号为空`);
      fail++; continue;
    }

    try {
      await createDoc(CONFIG.TABLES.wo, data);
      touchedWos.add(JSON.stringify({ wo_number: data.wo_number, bom_id: data.bom_id }));
      ok++;
    } catch (err) {
      errors.push(`第 ${i+2} 行：${err.message}`);
      fail++;
    }
  }

  for (const s of touchedWos) {
    const item = JSON.parse(s);
    try { await snapshotBomToWo(item.bom_id, item.wo_number); }
    catch (e) { console.error('快照失败', item.wo_number, e); }
    try { await syncExcessToInventory(item.wo_number); }
    catch (e) { console.error('同步失败', item.wo_number, e); }
  }

  let msg = `导入完成：成功 ${ok} 条，失败 ${fail} 条`;
  if (errors.length) {
    msg += '\n\n失败明细（前 10 条）：\n' + errors.slice(0, 10).join('\n');
    if (errors.length > 10) msg += `\n...还有 ${errors.length - 10} 条`;
  }
  alert(msg);

  await loadAll();
  e.target.value = '';
}

async function handleExport() {
  const res = await listDocs(CONFIG.TABLES.wo, [Query.limit(5000)]);
  const rows = res.documents.map(d => WO_HEADERS.map(h => d[h] ?? ''));
  exportCSV(WO_HEADERS, rows, 'work_orders');
}
</script>
