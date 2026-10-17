<template>
  <MainLayout>
    <div v-if="filterPart" class="notice">
      当前仅显示物料料号 <b>{{ filterPart }}</b> 的库存明细。
      <a href="#" @click.prevent="clearFilter">清除过滤</a>
    </div>

    <div class="page-header">
      <div class="search-bar">
        <input v-model="keyword" type="text" placeholder="按库位搜索...">
      </div>
      <ActionMenu :items="menuItems" />
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:44px;">
            <input type="checkbox"
                   :checked="allSelected"
                   :indeterminate="someSelected"
                   @change="toggleSelectAll">
          </th>
          <th style="width:60px;">序号</th>
          <th>物料料号</th>
          <th>物料名称</th>
          <th>物料数量</th>
          <th>库位</th>
          <th>来源</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(d, idx) in paginatedDocs" :key="d.$id">
          <td>
            <input type="checkbox" :value="d.$id" v-model="selectedIds">
          </td>
          <td>{{ (currentPage - 1) * PAGE_SIZE + idx + 1 }}</td>
          <td>{{ d.part_number || '' }}</td>
          <td>{{ partName(d.part_number) }}</td>
          <td><span class="qty-badge">{{ d.quantity ?? 0 }}</span></td>
          <td>{{ d.location || '' }}</td>
          <td>
            <span v-if="d.source_wo" style="color:#2563eb;font-size:13px;">
              {{ woProductNameMap[d.source_wo] || d.source_wo }}
            </span>
            <span v-else style="color:#999;font-size:13px;">正常</span>
          </td>
        </tr>
        <tr v-if="!loading && !paginatedDocs.length">
          <td colspan="7" style="text-align:center;color:#999;">暂无库存数据</td>
        </tr>
      </tbody>
    </table>
    <Pagination v-model:page="currentPage" :total="total" :loading="loading" />

    <input type="file" accept=".csv" hidden ref="fileInput" @change="handleImport">

    <div v-if="showModal" class="modal-mask">
      <div class="modal-box">
        <h3>{{ form.id ? '编辑库存' : '新增库存' }}</h3>
        <label>物料料号
          <input v-model="form.part_number" type="text" placeholder="如 M-2001"
                 :disabled="!!form.id || form.isAuto">
        </label>
        <label>物料名称
          <input v-model="form.part_name" type="text" placeholder="如 电阻0603">
        </label>
        <label>物料数量
          <input v-model.number="form.quantity" type="number" placeholder="如 1000"
                 :disabled="form.isAuto">
        </label>
        <label>库位
          <input v-model="form.location" type="text" placeholder="如 A-1-01"
                 :disabled="form.isAuto">
        </label>
        <p class="error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showModal = false">取消</button>
          <button class="btn-save" @click="saveForm">保存</button>
        </div>
      </div>
    </div>
  </MainLayout>
</template>

<script setup>
import { ref, onMounted, computed, reactive, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import ActionMenu from '../components/ActionMenu.vue';
import Pagination from '../components/Pagination.vue';
import { PAGE_SIZE, usePagination } from '../composables/usePagination.js';
import { CONFIG } from '../config.js';
import { listDocs, getDoc, createDoc, updateDoc, deleteDoc } from '../api/db.js';
import { exportCSV, readCSV } from '../api/csv.js';
import { partName, getPartMap, ensurePart } from '../api/partMap.js';
import { Query } from 'appwrite';

const route = useRoute();
const router = useRouter();

const keyword = ref('');
const filterPart = ref(route.query.part || null);
const fileInput = ref(null);
const showModal = ref(false);
const formError = ref('');
const woProductNameMap = ref({});
const selectedIds = ref([]);

const form = reactive({
  id: '', part_number: '', part_name: '', quantity: '', location: '', isAuto: false
});

const menuItems = computed(() => [
  { label: '新增库存', onClick: openAdd },
  { label: '编辑', onClick: editSelected, disabled: selectedIds.value.length !== 1 },
  { label: '删除', onClick: deleteSelected, disabled: selectedIds.value.length === 0 },
  { label: '导入CSV', onClick: triggerImport },
  { label: '导出CSV', onClick: handleExport }
]);

const { currentPage, paginatedItems: paginatedDocs, total, loading, reload } =
  usePagination([], {
    mode: 'server',
    pageSize: PAGE_SIZE,
    fetcher: async ({ page, pageSize }) => {
      const queries = [
        Query.orderAsc('part_number'),
        Query.limit(pageSize),
        Query.offset((page - 1) * pageSize),
      ];
      if (filterPart.value) queries.push(Query.equal('part_number', filterPart.value));
      const kw = keyword.value.trim();
      if (kw) queries.push(Query.startsWith('location', kw));
      const res = await listDocs(CONFIG.TABLES.inventory, queries);
      return { items: res.documents, total: res.total };
    },
  });

watch(keyword, () => { if (currentPage.value !== 1) currentPage.value = 1; else reload(); });
watch(filterPart, () => { if (currentPage.value !== 1) currentPage.value = 1; else reload(); });

const allSelected = computed(() =>
  paginatedDocs.value.length > 0 &&
  paginatedDocs.value.every(d => selectedIds.value.includes(d.$id))
);
const someSelected = computed(() =>
  !allSelected.value &&
  paginatedDocs.value.some(d => selectedIds.value.includes(d.$id))
);
function toggleSelectAll(e) {
  if (e.target.checked) {
    const set = new Set(selectedIds.value);
    paginatedDocs.value.forEach(d => set.add(d.$id));
    selectedIds.value = Array.from(set);
  } else {
    const ids = new Set(paginatedDocs.value.map(d => d.$id));
    selectedIds.value = selectedIds.value.filter(id => !ids.has(id));
  }
}

async function loadWoMap() {
  const res = await listDocs(CONFIG.TABLES.wo, [Query.limit(5000)]);
  const map = {};
  res.documents.forEach(w => {
    if (w.wo_number) map[w.wo_number] = w.product_name || '';
  });
  woProductNameMap.value = map;
}

onMounted(async () => {
  await getPartMap();
  await Promise.all([reload(), loadWoMap()]);
});

function clearFilter() {
  filterPart.value = null;
  router.replace({ name: 'inventory' });
}

function openAdd() {
  Object.assign(form, {
    id: '', part_number: '', part_name: '', quantity: '', location: '', isAuto: false
  });
  formError.value = '';
  showModal.value = true;
}

async function editSelected() {
  if (selectedIds.value.length !== 1) { alert('请只勾选一行再点编辑'); return; }
  const docId = selectedIds.value[0];
  try {
    const doc = await getDoc(CONFIG.TABLES.inventory, docId);
    const isAuto = !!doc.source_wo;
    Object.assign(form, {
      id: doc.$id,
      part_number: doc.part_number || '',
      part_name: partName(doc.part_number) || doc.part_name || '',
      quantity: doc.quantity ?? '',
      location: doc.location || '',
      isAuto
    });
    formError.value = isAuto
      ? `该记录由 ${woProductNameMap.value[doc.source_wo] || doc.source_wo} 超发自动生成，数量/库位/料号不可改。`
      : '';
    showModal.value = true;
  } catch (e) {
    alert('读取失败：' + e.message);
  }
}

async function saveForm() {
  const part_number = (form.part_number || '').trim();
  const part_name = (form.part_name || '').trim();
  const location = (form.location || '').trim();
  const quantity = Number(form.quantity);

  if (!part_number || !part_name || !location) {
    formError.value = '物料料号、物料名称、库位必填'; return;
  }
  if (isNaN(quantity) || quantity < 0) {
    formError.value = '物料数量必须是非负整数'; return;
  }

  try {
    await ensurePart(part_number, part_name);
    if (form.id) {
      if (form.isAuto) {
        // 自动记录不改数量/库位/料号，名称走主数据即可，不写库
        await updateDoc(CONFIG.TABLES.inventory, form.id, {});
      } else {
        await updateDoc(CONFIG.TABLES.inventory, form.id, { quantity, location });
      }
    } else {
      const dup = await listDocs(CONFIG.TABLES.inventory, [
        Query.equal('location', location), Query.limit(1)
      ]);
      if (dup.documents.length && dup.documents[0].part_number !== part_number) {
        formError.value = `库位 ${location} 已被物料 ${dup.documents[0].part_number} 占用`;
        return;
      }
      await createDoc(CONFIG.TABLES.inventory, { part_number, quantity, location });
    }
    showModal.value = false;
    selectedIds.value = [];
    await reload();
  } catch (e) {
    formError.value = '保存失败：' + (e.message || e);
  }
}

async function deleteSelected() {
  if (!selectedIds.value.length) return;
  const msg = `确认删除已勾选的 ${selectedIds.value.length} 条库存？`;
  const ok = window.$confirm
    ? await window.$confirm({ title: '删除确认', message: msg })
    : confirm(msg);
  if (!ok) return;

  let ok2 = 0, fail = 0;
  for (const id of selectedIds.value) {
    try { await deleteDoc(CONFIG.TABLES.inventory, id); ok2++; }
    catch (e) { console.error('删除失败', id, e); fail++; }
  }
  selectedIds.value = [];
  await reload();
  if (fail > 0) alert(`删除完成：成功 ${ok2} 条，失败 ${fail} 条`);
}

function triggerImport() { fileInput.value.click(); }

async function handleImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);

  const required = ['part_number', 'part_name', 'quantity', 'location'];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    alert('CSV 缺少必需列：' + missing.join(', '));
    e.target.value = '';
    return;
  }

  let ok = 0, fail = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const data = {};
    headers.forEach((h, idx) => {
      const v = row[idx];
      if (v === undefined || v === null || v === '') return;
      if (h === 'quantity') {
        const n = Number(v); if (isNaN(n)) return;
        data[h] = n;
      } else data[h] = String(v).trim();
    });
    if (!data.part_number || !data.location) continue;
    try {
      // 先把名称写入主数据
      await ensurePart(data.part_number, data.part_name || '');
      const dup = await listDocs(CONFIG.TABLES.inventory, [
        Query.equal('location', data.location), Query.limit(1)
      ]);
      if (dup.documents.length && dup.documents[0].part_number !== data.part_number) {
        errors.push(`第 ${i+2} 行：库位 ${data.location} 已被 ${dup.documents[0].part_number} 占用`);
        fail++; continue;
      }
      const { part_name, ...invData } = data; // 不再写 part_name 到库存表
      await createDoc(CONFIG.TABLES.inventory, invData);
      ok++;
    } catch (err) {
      errors.push(`第 ${i+2} 行：${err.message}`); fail++;
    }
  }

  let msg = `导入完成：成功 ${ok} 条，失败 ${fail} 条`;
  if (errors.length) {
    msg += '\n\n失败明细（前 10 条）：\n' + errors.slice(0, 10).join('\n');
    if (errors.length > 10) msg += `\n...还有 ${errors.length - 10} 条`;
  }
  alert(msg);

  await reload();
  e.target.value = '';
}

async function handleExport() {
  const headers = ['part_number', 'part_name', 'quantity', 'location', 'source_wo'];
  const all = [];
  const chunk = 500;
  let offset = 0;
  while (true) {
    const res = await listDocs(CONFIG.TABLES.inventory, [
      Query.limit(chunk), Query.offset(offset)
    ]);
    all.push(...res.documents);
    if (res.documents.length < chunk) break;
    offset += chunk;
  }
  const rows = all.map(d => [
    d.part_number ?? '',
    partName(d.part_number),
    d.quantity ?? '',
    d.location ?? '',
    d.source_wo ?? ''
  ]);
  exportCSV(headers, rows, 'inventory');
}
</script>
