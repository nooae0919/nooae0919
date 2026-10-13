<template>
  <MainLayout>
    <div class="page-header">
      <div class="search-bar">
        <input v-model="keyword" type="text" placeholder="按领料单号 / 工单号 / 领料人搜索...">
      </div>
      <ActionMenu :items="menuItems" />
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:44px;">
            <input type="checkbox" :checked="allSelected" :indeterminate="someSelected" @change="toggleSelectAll">
          </th>
          <th style="width:60px;">序号</th>
          <th>领料单号</th>
          <th>工单号</th>
          <th>成品料号</th>
          <th>成品名称</th>
          <th>物料种类</th>
          <th>领料总数</th>
          <th>领料人</th>
          <th>领料时间</th>
          <th style="width:160px;">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(b, idx) in filteredBatches" :key="b.key">
          <td><input type="checkbox" :value="b.key" v-model="selectedKeys"></td>
          <td>{{ idx + 1 }}</td>
          <td>
            <a class="part-link" href="#" @click.prevent="goDetail(b)">
              {{ b.issue_no || '(无单号)' }}
            </a>
          </td>
          <td>{{ b.wo_number || '' }}</td>
          <td>{{ b.product_number || '' }}</td>
          <td>{{ b.product_name || '' }}</td>
          <td>{{ b.items.length }} 种</td>
          <td><b>{{ b.totalQty }}</b></td>
          <td>{{ b.operator || '' }}</td>
          <td>{{ b.issue_time || '' }}</td>
          <td>
            <button @click="goDetail(b)">详情</button>
            <button @click="deleteBatch(b)">删除</button>
          </td>
        </tr>
        <tr v-if="!filteredBatches.length">
          <td colspan="11" style="text-align:center;color:#999;">暂无领料单</td>
        </tr>
      </tbody>
    </table>

    <input type="file" accept=".csv" hidden ref="fileInput" @change="handleImport">

    <div v-if="showAdd" class="modal-mask">
      <div class="modal-box" style="width:760px;max-width:94vw;">
        <h3>新增领料单</h3>
        <label>工单
          <select v-model="addForm.wo_number">
            <option value="">— 请选择工单 —</option>
            <option v-for="w in woList" :key="w.$id" :value="w.wo_number">
              {{ w.wo_number }} / {{ w.product_number }} / {{ w.product_name }}
            </option>
          </select>
        </label>
        <label>领料人
          <input v-model="addForm.operator" type="text" placeholder="默认当前登录用户">
        </label>
        <div style="margin:8px 0;font-size:13px;color:#555;display:flex;justify-content:space-between;align-items:center;">
          <span>物料明细</span>
          <button class="btn-cancel" style="padding:4px 10px;" @click="addRow">+ 加一行</button>
        </div>
        <table style="margin-bottom:12px;">
          <thead>
            <tr>
              <th style="width:50px;">#</th>
              <th>物料料号</th>
              <th>物料名称</th>
              <th style="width:120px;">数量</th>
              <th style="width:70px;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in addForm.items" :key="i">
              <td>{{ i + 1 }}</td>
              <td><input v-model="r.part_number" type="text" style="margin:0;"></td>
              <td><input v-model="r.part_name" type="text" style="margin:0;"></td>
              <td><input v-model.number="r.issue_qty" type="number" style="margin:0;"></td>
              <td>
                <button class="btn-cancel" style="padding:4px 8px;"
                        @click="removeRow(i)" :disabled="addForm.items.length <= 1">删</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="error">{{ addError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showAdd = false">取消</button>
          <button class="btn-save" @click="saveAdd">保存</button>
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
import { listDocs, createDoc, deleteDoc } from '../api/db.js';
import { exportCSV, readCSV } from '../api/csv.js';
import { syncExcessToInventory } from '../api/kitting.js';
import { authStore } from '../stores/auth.js';
import { Query } from 'appwrite';

const router = useRouter();

const allIssues = ref([]);
const woList = ref([]);
const keyword = ref('');
const fileInput = ref(null);
const selectedKeys = ref([]);
const showAdd = ref(false);
const addError = ref('');

const addForm = reactive({
  wo_number: '',
  operator: '',
  items: [{ part_number: '', part_name: '', issue_qty: '' }]
});

/* ⭐ 操作菜单 */
const menuItems = computed(() => [
  { label: '新增领料单', onClick: openAdd },
  { label: '导入CSV', onClick: triggerImport },
  { label: '导出CSV', onClick: handleExport, disabled: selectedKeys.value.length === 0 }
]);

function genIssueNo() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `IS${date}${time}${rand}`;
}
function nowStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const woMap = computed(() => {
  const m = {};
  woList.value.forEach(w => { m[w.wo_number] = w; });
  return m;
});

const batches = computed(() => {
  const map = {};
  allIssues.value.forEach(d => {
    const key = d.issue_no
      ? `NO:${d.issue_no}`
      : `FB:${d.wo_number}|${d.operator || ''}|${d.issue_time || ''}`;
    if (!map[key]) {
      map[key] = {
        key,
        issue_no: d.issue_no || '',
        wo_number: d.wo_number,
        operator: d.operator,
        issue_time: d.issue_time,
        items: [],
        totalQty: 0
      };
    }
    map[key].items.push(d);
    map[key].totalQty += Number(d.issue_qty) || 0;
  });
  Object.values(map).forEach(b => {
    const w = woMap.value[b.wo_number];
    b.product_number = w?.product_number || '';
    b.product_name = w?.product_name || '';
  });
  return Object.values(map).sort((a, b) =>
    (b.issue_time || '').localeCompare(a.issue_time || '')
  );
});

const filteredBatches = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return batches.value;
  return batches.value.filter(b =>
    (b.issue_no || '').toLowerCase().includes(kw) ||
    (b.wo_number || '').toLowerCase().includes(kw) ||
    (b.operator || '').toLowerCase().includes(kw)
  );
});

const allSelected = computed(() =>
  filteredBatches.value.length > 0 &&
  filteredBatches.value.every(b => selectedKeys.value.includes(b.key))
);
const someSelected = computed(() =>
  !allSelected.value &&
  filteredBatches.value.some(b => selectedKeys.value.includes(b.key))
);
function toggleSelectAll(e) {
  if (e.target.checked) {
    const set = new Set(selectedKeys.value);
    filteredBatches.value.forEach(b => set.add(b.key));
    selectedKeys.value = Array.from(set);
  } else {
    const keys = new Set(filteredBatches.value.map(b => b.key));
    selectedKeys.value = selectedKeys.value.filter(k => !keys.has(k));
  }
}

async function loadAll() {
  const [issueRes, woRes] = await Promise.all([
    listDocs(CONFIG.TABLES.issue, [Query.limit(10000)]),
    listDocs(CONFIG.TABLES.wo, [Query.limit(5000)])
  ]);
  allIssues.value = issueRes.documents;
  woList.value = woRes.documents;
  const validKeys = new Set(batches.value.map(b => b.key));
  selectedKeys.value = selectedKeys.value.filter(k => validKeys.has(k));
}
onMounted(loadAll);

function goDetail(b) {
  if (!b.issue_no) { alert('该领料单没有单号（老数据），无法进入详情。'); return; }
  router.push({ name: 'issue-detail', params: { issueNo: b.issue_no } });
}

function openAdd() {
  addForm.wo_number = '';
  addForm.operator = authStore.user?.name || authStore.user?.email || '';
  addForm.items = [{ part_number: '', part_name: '', issue_qty: '' }];
  addError.value = '';
  showAdd.value = true;
}
function addRow() { addForm.items.push({ part_number: '', part_name: '', issue_qty: '' }); }
function removeRow(i) {
  if (addForm.items.length <= 1) return;
  addForm.items.splice(i, 1);
}

async function saveAdd() {
  if (!addForm.wo_number) { addError.value = '请选择工单'; return; }
  const valid = addForm.items.filter(r =>
    r.part_number && r.issue_qty && Number(r.issue_qty) > 0
  );
  if (!valid.length) { addError.value = '至少填写一条有效物料'; return; }

  const issueNo = genIssueNo();
  const timeStr = nowStr();
  const operator = addForm.operator.trim();

  let ok = 0, fail = 0;
  for (const r of valid) {
    try {
      await createDoc(CONFIG.TABLES.issue, {
        issue_no: issueNo,
        wo_number: addForm.wo_number,
        part_number: String(r.part_number).trim(),
        part_name: String(r.part_name || '').trim(),
        issue_qty: Number(r.issue_qty),
        operator,
        issue_time:
