<template>
  <MainLayout>
    <div class="page-header">
      <div class="search-bar">
        <input v-model="searchInput" type="text" placeholder="按工单号搜索..." @keyup.enter="handleSearch">
        <button @click="handleSearch">查询</button>
        <button v-if="keyword" @click="clearSearch" style="background:#f3f4f6;">重置</button>
        <select v-model="lineFilter"
                style="padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;margin-left:8px;">
          <option value="">全部线体</option>
          <option value="1线">1线</option>
          <option value="2线">2线</option>
        </select>
      </div>
      <ActionMenu :items="menuItems" />
    </div>

    <div v-if="progressText" class="notice" style="background:#fef3c7;border-left-color:#d97706;color:#92400e;">
      {{ progressText }}
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
        <tr v-for="d in paginatedDocs" :key="d.$id">
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
        <tr v-if="!loading && !paginatedDocs.length">
          <td colspan="11" style="text-align:center;color:#999;">暂无工单</td>
        </tr>
      </tbody>
    </table>
    <Pagination v-model:page="currentPage" :total="total" :loading="loading" />

    <input type="file" accept=".csv" hidden ref="fileInput" @change="handleImport">

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
          <input :value="form.product_number" type="text" readonly style="background:#f3f4f6;cursor:not-allowed;">
        </label>
        <label>成品名称
          <input :value="form.product_name" type="text" readonly style="background:#f3f4f6;cursor:not-allowed;">
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
          <input :value="editForm.product_number" type="text" readonly style="background:#f3f4f6;cursor:not-allowed;">
        </label>
        <label>成品名称
          <input :value="editForm.product_name" type="text" readonly style="background:#f3f4f6;cursor:not-allowed;">
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
import { ref, onMounted, computed, reactive, watch } from 'vue';
import { useRouter } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import ActionMenu from '../components/ActionMenu.vue';
import Pagination from '../components/Pagination.vue';
import { PAGE_SIZE, usePagination } from '../composables/usePagination.js';
import { CONFIG } from '../config.js';
import { listDocs, getDoc, createDoc, updateDoc } from '../api/db.js';
import { exportCSV, readCSV } from '../api/csv.js';
import { syncExcessToInventory, snapshotBomToWo } from '../api/kitting.js';
import { Query } from 'appwrite';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const router = useRouter();

const WO_HEADERS = ['wo_number', 'line', 'product_number', 'product_name', 'plan_qty', 'produce_date', 'status'];

const bomList = ref([]);
const bomMap = ref({});
const bomVersionMap = ref({});
const snapshotVersionMap = ref({});
const finishedMap = ref({});
const searchInput = ref('');
const keyword = ref('');
const lineFilter = ref('');
const fileInput = ref(null);
const showAdd = ref(false);
const showEdit = ref(false);
const formError = ref('');
const editError = ref('');
const progressText = ref('');

const form = reactive({
  bom_id: '', wo_number: '', line: '', product_number: '', product_name: '', plan_qty: '', produce_date: '', status: 'pending'
});
const editForm = reactive({
  $id: '', bom_id: '', wo_number: '', line: '', product_number: '', product_name: '', plan_qty: '', produce_date: '', status: 'pending'
});

const menuItems = computed(() => [
  { label: '新增工单', onClick: openAdd },
  { label: '导入CSV', onClick: triggerImport },
  { label: '导出CSV', onClick: handleExport },
  { label: '批量初始化快照', onClick: batchInitSnapshots }
]);

function statusText(s) { return s === 'completed' ? '已完成' : s === 'in_progress' ? '生产中' : '待生产'; }
function remainQty(wo) { return Math.max((Number(wo.plan_qty) || 0) - (Number(finishedMap.value[wo.wo_number]) || 0), 0); }

const { currentPage, paginatedItems: paginatedDocs, total, loading, reload } =
  usePagination([], {
    mode: 'server',
    pageSize: PAGE_SIZE,
    fetcher: async ({ page, pageSize }) => {
      const queries = [Query.limit(pageSize), Query.offset((page - 1) * pageSize)];
      if (lineFilter.value) queries.push(Query.equal('line', lineFilter.value));
      if (keyword.value) queries.push(Query.search('wo_number', keyword.value));
      
      const res = await listDocs(CONFIG.TABLES.wo, queries);
      const woNumbers = res.documents.map(d => d.wo_number).filter(Boolean);
      const snapMap = {};
      const finMap = {};
      
      if (woNumbers.length) {
        const [snapRes, finRes] = await Promise.all([
          listDocs(CONFIG.TABLES.woBom, [Query.equal('wo_number', woNumbers), Query.limit(20000)]),
          listDocs(CONFIG.TABLES.finish, [Query.equal('wo_number', woNumbers), Query.limit(20000)]),
        ]);
        snapRes.documents.forEach(it => { if (!snapMap[it.wo_number]) snapMap[it.wo_number] = it.bom_version || ''; });
        finRes.documents.forEach(d => { if (d.wo_number) finMap[d.wo_number] = (finMap[d.wo_number] || 0) + (Number(d.finish_qty) || 0); });
      }
      snapshotVersionMap.value = snapMap;
      finishedMap.value = finMap;
      return { items: res.documents, total: res.total };
    },
  });

function handleSearch() {
  keyword.value = searchInput.value.trim();
  if (currentPage.value !== 1) currentPage.value = 1;
  else reload();
}
function clearSearch() { searchInput.value = ''; handleSearch(); }

watch(lineFilter, () => { if (currentPage.value !== 1) currentPage.value = 1; else reload(); });

async function loadBoms() {
  const res = await listDocs(CONFIG.TABLES.bom, [Query.limit(5000), Query.orderAsc('product_number')]);
  bomList.value = res.documents;
  const map = {}, vmap = {};
  res.documents.forEach(b => { map[b.$id] = b; vmap[b.$id] = b.version || ''; });
  bomMap.value = map;
  bomVersionMap.value = vmap;
}

onMounted(async () => { await Promise.all([reload(), loadBoms()]); });

function onBomChange(which) {
  const target = which === 'add' ? form : editForm;
  const b = bomMap.value[target.bom_id];
  if (b) { target.product_number = b.product_number || ''; target.product_name = b.product_name || ''; }
  else { target.product_number = ''; target.product_name = ''; }
}

function openAdd() {
  Object.assign(form, { bom_id: '', wo_number: '', line: '', product_number: '', product_name: '', plan_qty: '', produce_date: '', status: 'pending' });
  formError.value = '';
  showAdd.value = true;
}

async function saveAdd() {
  if (!form.line) { formError.value = '请选择线体'; return; }
  if (!form.bom_id) { formError.value = '请先选择关联 BOM'; return; }
  if (!form.wo_number || !form.plan_qty) { formError.value = '工单号和计划数量必填'; return; }
  try {
    await createDoc(CONFIG.TABLES.wo, {
      bom_id: form.bom_id, wo_number: form.wo_number, line: form.line,
      product_number: form.product_number, product_name: form.product_name,
      plan_qty: Number(form.plan_qty), produce_date: form.produce_date, status: form.status
    });

    progressText.value = `正在生成 BOM 快照...`;
    try { await snapshotBomToWo(form.bom_id, form.wo_number, p => { progressText.value = `[${p.phase === 'delete' ? '删除旧快照' : '写入新快照'}] ${p.done}/${p.total}`; }); } catch (e) { console.error(e); }
    try { await syncExcessToInventory(form.wo_number); } catch (e) { console.error(e); }

    progressText.value = '';
    showAdd.value = false;
    await reload();
  } catch (e) { progressText.value = ''; formError.value = '保存失败：' + (e.message || e); }
}

async function openEdit(docId) {
  try {
    const doc = await getDoc(CONFIG.TABLES.wo, docId);
    if (doc.status === 'completed') { alert('该工单已完成，不允许修改。'); return; }
    Object.assign(editForm, {
      $id: doc.$id, bom_id: doc.bom_id || '', wo_number: doc.wo_number || '', line: doc.line || '',
      product_number: doc.product_number || '', product_name: doc.product_name || '',
      plan_qty: doc.plan_qty || '', produce_date: doc.produce_date || '', status: doc.status || 'pending'
    });
    editError.value = '';
    showEdit.value = true;
  } catch (e) { alert('读取工单失败：' + e.message); }
}

async function saveEdit() {
  if (!editForm.line) { editError.value = '请选择线体'; return; }
  if (!editForm.bom_id) { editError.value = '请先选择关联 BOM'; return; }
  if (!editForm.plan_qty) { editError.value = '计划数量必填'; return; }
  try {
    const current = await getDoc(CONFIG.TABLES.wo, editForm.$id);
    if (current.status === 'completed') {
      editError.value = '该工单已完成，不允许修改。';
      setTimeout(() => { showEdit.value = false; reload(); }, 1200);
      return;
    }
    const bomChanged = current.bom_id !== editForm.bom_id;

    await updateDoc(CONFIG.TABLES.wo, editForm.$id, {
      bom_id: editForm.bom_id, line: editForm.line,
      product_number: editForm.product_number, product_name: editForm.product_name,
      plan_qty: Number(editForm.plan_qty), produce_date: editForm.produce_date, status: editForm.status
    });

    if (bomChanged) {
      if (confirm('检测到关联 BOM 已变更，是否用新 BOM 重新生成工单用料快照？')) {
        progressText.value = `正在重载 BOM 快照...`;
        try { await snapshotBomToWo(editForm.bom_id, editForm.wo_number, p => { progressText.value = `[${p.phase === 'delete' ? '删除旧快照' : '写入新快照'}] ${p.done}/${p.total}`; }); } catch (e) { alert('快照更新失败：' + (e.message || e)); } finally { progressText.value = ''; }
      }
    }

    try { await syncExcessToInventory(editForm.wo_number); } catch (e) { console.error(e); }
    showEdit.value = false;
    await reload();
  } catch (e) { editError.value = '保存失败：' + (e.message || e); }
}

function goKitting(wo) {
  if (!wo.bom_id) { alert('该工单未关联 BOM，无法做齐套分析。'); return; }
  router.push({ name: 'wo-kitting', params: { woId: wo.$id } });
}

async function reloadBom(wo) {
  if (!wo.bom_id) { alert('该工单未关联 BOM。'); return; }
  if (!confirm(`工单 ${wo.wo_number} 将用当前 BOM 最新明细覆盖用料快照，确认继续？`)) return;

  progressText.value = `正在重载 BOM 快照...`;
  try {
    const res = await snapshotBomToWo(wo.bom_id, wo.wo_number, p => { progressText.value = `[${p.phase === 'delete' ? '删除旧快照' : '写入新快照'}] ${p.done}/${p.total}`; });
    progressText.value = `正在同步超发库存...`;
    await syncExcessToInventory(wo.wo_number);
    progressText.value = '';
    alert(`BOM 快照已重载，共 ${res.ok} 条明细（版本 ${res.bomVersion || '-'}）。`);
    await reload();
  } catch (e) { progressText.value = ''; alert('重载失败：' + (e.message || e)); }
}

async function batchInitSnapshots() {
  const all = [];
  let offset = 0;
  while (true) {
    const res = await listDocs(CONFIG.TABLES.wo, [Query.limit(500), Query.offset(offset)]);
    all.push(...res.documents);
    if (res.documents.length < 500) break;
    offset += 500;
  }
  const missing = all.filter(d => d.bom_id && !snapshotVersionMap.value[d.wo_number]);
  if (!missing.length) { alert('所有工单都已有快照，无需初始化。'); return; }
  if (!confirm(`共 ${missing.length} 个工单缺少快照，确认批量生成？`)) return;

  let success = 0, fail = 0;
  const errors = [];

  for (let i = 0; i < missing.length; i++) {
    const wo = missing[i];
    progressText.value = `批量初始化快照：${i + 1}/${missing.length}（成功 ${success}，失败 ${fail}）`;
    try {
      await snapshotBomToWo(wo.bom_id, wo.wo_number, p => { progressText.value = `批量初始化：工单 ${wo.wo_number}（${i+1}/${missing.length}）[${p.phase}] ${p.done}/${p.total}`; });
      success++;
    } catch (e) { errors.push(`${wo.wo_number}: ${e.message || e}`); fail++; }
    if (i < missing.length - 1) await sleep(1500);
  }

  progressText.value = '';
  await reload();

  let msg = `批量初始化完成：成功 ${success} 个，失败 ${fail} 个。`;
  if (errors.length) msg += '\n\n失败明细：\n' + errors.slice(0, 10).join('\n');
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
  const touchedWos = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const data = {};
    headers.forEach((h, idx) => {
      const v = row[idx];
      if (v === undefined || v === null || v === '') return;
      if (h === 'plan_qty') { const n = Number(v); if (isNaN(n)) return; data[h] = n; }
      else data[h] = String(v).trim();
    });

    if (!data.bom_id && data.product_number) {
      const bid = pnToBom[data.product_number];
      if (bid) data.bom_id = bid;
    }
    if (!data.bom_id) { errors.push(`第 ${i+2} 行：找不到匹配的 BOM`); fail++; continue; }
    if (!data.wo_number) { errors.push(`第 ${i+2} 行：工单号为空`); fail++; continue; }

    try {
      await createDoc(CONFIG.TABLES.wo, data);
      touchedWos.push({ wo_number: data.wo_number, bom_id: data.bom_id });
      ok++;
    } catch (err) { errors.push(`第 ${i+2} 行：${err.message}`); fail++; }
  }

  for (let i = 0; i < touchedWos.length; i++) {
    const item = touchedWos[i];
    progressText.value = `正在处理工单快照：${i+1}/${touchedWos.length}`;
    try { await snapshotBomToWo(item.bom_id, item.wo_number); } catch (e) {}
    try { await syncExcessToInventory(item.wo_number); } catch (e) {}
    if (i < touchedWos.length - 1) await sleep(1500);
  }
  progressText.value = '';

  let msg = `导入完成：成功 ${ok} 条，失败 ${fail} 条`;
  if (errors.length) msg += '\n\n' + errors.slice(0, 10).join('\n');
  alert(msg);
  await reload();
  e.target.value = '';
}

async function handleExport() {
  const all = [];
  let offset = 0;
  while (true) {
    const res = await listDocs(CONFIG.TABLES.wo, [Query.limit(500), Query.offset(offset)]);
    all.push(...res.documents);
    if (res.documents.length < 500) break;
    offset += 500;
  }
  const rows = all.map(d => WO_HEADERS.map(h => d[h] ?? ''));
  exportCSV(WO_HEADERS, rows, 'work_orders');
}
</script>
