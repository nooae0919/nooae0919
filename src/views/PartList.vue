<template>
  <MainLayout>
    <div class="page-header">
      <div class="search-bar" style="display: flex; gap: 8px;">
        <input v-model="searchInput" type="text" placeholder="按料号 / 名称 / 规格搜索..." @keyup.enter="handleSearch" style="flex: 1; max-width: 320px; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;">
        <!-- ⭐ 补充了这两个按钮 -->
        <button @click="handleSearch" style="padding: 8px 16px; border: 1px solid #2563eb; background: #2563eb; color: #fff; border-radius: 6px; cursor: pointer;">查询</button>
        <button v-if="keyword" @click="clearSearch" style="padding: 8px 16px; border: 1px solid #d1d5db; background: #fff; border-radius: 6px; cursor: pointer;">重置</button>
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
          <th>物料料号</th>
          <th>物料名称</th>
          <th>规格型号</th>
          <th>单位</th>
          <th>分类</th>
          <th>备注</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(d, idx) in paginatedDocs" :key="d.$id">
          <td><input type="checkbox" :value="d.$id" v-model="selectedIds"></td>
          <td>{{ (currentPage - 1) * PAGE_SIZE + idx + 1 }}</td>
          <td>{{ d.part_number }}</td>
          <td>{{ d.part_name || '' }}</td>
          <td>{{ d.spec || '' }}</td>
          <td>{{ d.unit || '' }}</td>
          <td>{{ d.category || '' }}</td>
          <td>{{ d.remark || '' }}</td>
        </tr>
        <tr v-if="!loading && !paginatedDocs.length">
          <td colspan="8" style="text-align:center;color:#999;">暂无物料主数据</td>
        </tr>
      </tbody>
    </table>
    <Pagination v-model:page="currentPage" :total="total" :loading="loading" />

    <input type="file" accept=".csv" hidden ref="fileInput" @change="handleImport">

    <div v-if="showModal" class="modal-mask">
      <div class="modal-box">
        <h3>{{ form.id ? '编辑物料' : '新增物料' }}</h3>
        <label>物料料号
          <input v-model="form.part_number" type="text" :disabled="!!form.id">
        </label>
        <label>物料名称
          <input v-model="form.part_name" type="text">
        </label>
        <label>规格型号
          <input v-model="form.spec" type="text">
        </label>
        <label>单位
          <input v-model="form.unit" type="text" placeholder="如 PCS">
        </label>
        <label>分类
          <input v-model="form.category" type="text">
        </label>
        <label>备注
          <input v-model="form.remark" type="text">
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
import MainLayout from '../layouts/MainLayout.vue';
import ActionMenu from '../components/ActionMenu.vue';
import Pagination from '../components/Pagination.vue';
import { PAGE_SIZE, usePagination } from '../composables/usePagination.js';
import { CONFIG } from '../config.js';
import { listDocs, getDoc, createDoc, updateDoc, deleteDoc } from '../api/db.js';
import { exportCSV, readCSV } from '../api/csv.js';
import { refreshPartCache } from '../api/partMap.js';
import { Query } from 'appwrite';

const keyword = ref('');
const fileInput = ref(null);
const selectedIds = ref([]);
const showModal = ref(false);
const formError = ref('');
const form = reactive({
  id: '', part_number: '', part_name: '', spec: '', unit: '', category: '', remark: ''
});

const menuItems = computed(() => [
  { label: '新增物料', onClick: openAdd },
  { label: '编辑', onClick: editSelected, disabled: selectedIds.value.length !== 1 },
  { label: '删除', onClick: deleteSelected, disabled: selectedIds.value.length === 0 },
  { label: '导入CSV', onClick: triggerImport },
  { label: '导出CSV', onClick: handleExport, disabled: selectedIds.value.length === 0 },
  { label: '刷新缓存', onClick: async () => { await refreshPartCache(); alert('主数据缓存已刷新'); } },
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
      const kw = keyword.value.trim();
      if (kw) queries.unshift(Query.search('part_number', kw));
      const res = await listDocs(CONFIG.TABLES.part, queries);
      return { items: res.documents, total: res.total };
    },
  });

watch(keyword, () => { if (currentPage.value !== 1) currentPage.value = 1; else reload(); });

onMounted(async () => {
  await reload();
  await refreshPartCache();
});

const allSelected = computed(() =>
  paginatedDocs.value.length > 0 &&
  paginatedDocs.value.every(d => selectedIds.value.includes(d.$id))
);
const someSelected = computed(() =>
  !allSelected.value && paginatedDocs.value.some(d => selectedIds.value.includes(d.$id))
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

function openAdd() {
  Object.assign(form, { id: '', part_number: '', part_name: '', spec: '', unit: '', category: '', remark: '' });
  formError.value = '';
  showModal.value = true;
}

async function editSelected() {
  if (selectedIds.value.length !== 1) return;
  const doc = await getDoc(CONFIG.TABLES.part, selectedIds.value[0]);
  Object.assign(form, {
    id: doc.$id,
    part_number: doc.part_number || '',
    part_name: doc.part_name || '',
    spec: doc.spec || '',
    unit: doc.unit || '',
    category: doc.category || '',
    remark: doc.remark || '',
  });
  formError.value = '';
  showModal.value = true;
}

async function saveForm() {
  const part_number = (form.part_number || '').trim();
  if (!part_number) { formError.value = '物料料号必填'; return; }
  try {
    if (form.id) {
      await updateDoc(CONFIG.TABLES.part, form.id, {
        part_name: form.part_name, spec: form.spec,
        unit: form.unit, category: form.category, remark: form.remark,
      });
    } else {
      const dup = await listDocs(CONFIG.TABLES.part, [
        Query.equal('part_number', part_number), Query.limit(1)
      ]);
      if (dup.documents.length) { formError.value = `料号 ${part_number} 已存在`; return; }
      await createDoc(CONFIG.TABLES.part, {
        part_number, part_name: form.part_name, spec: form.spec,
        unit: form.unit, category: form.category, remark: form.remark,
      });
    }
    showModal.value = false;
    selectedIds.value = [];
    await reload();
    await refreshPartCache();
  } catch (e) {
    formError.value = '保存失败：' + (e.message || e);
  }
}

async function deleteSelected() {
  if (!selectedIds.value.length) return;
  const ok = window.$confirm
    ? await window.$confirm({ title: '删除确认', message: `将删除 ${selectedIds.value.length} 条物料主数据，确认？` })
    : confirm(`将删除 ${selectedIds.value.length} 条物料主数据，确认？`);
  if (!ok) return;
  let ok2 = 0, fail = 0;
  for (const id of selectedIds.value) {
    try { await deleteDoc(CONFIG.TABLES.part, id); ok2++; }
    catch (e) { fail++; }
  }
  selectedIds.value = [];
  await reload();
  await refreshPartCache();
  if (fail) alert(`删除完成：成功 ${ok2}，失败 ${fail}`);
}

function triggerImport() { fileInput.value.click(); }

async function handleImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);
  const required = ['part_number', 'part_name'];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    alert('CSV 缺少必需列：' + missing.join(', ') + '\n模板：part_number,part_name,spec,unit,category,remark');
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
      if (v !== undefined && v !== null && v !== '') data[h] = String(v).trim();
    });
    if (!data.part_number) { errors.push(`第 ${i+2} 行：料号为空`); fail++; continue; }
    try {
      const dup = await listDocs(CONFIG.TABLES.part, [
        Query.equal('part_number', data.part_number), Query.limit(1)
      ]);
      if (dup.documents.length) {
        await updateDoc(CONFIG.TABLES.part, dup.documents[0].$id, {
          part_name: data.part_name || dup.documents[0].part_name
        });
        ok++;
      } else {
        await createDoc(CONFIG.TABLES.part, data);
        ok++;
      }
    } catch (err) {
      errors.push(`第 ${i+2} 行：${err.message}`); fail++;
    }
  }
  let msg = `导入完成：成功 ${ok} 条，失败 ${fail} 条`;
  if (errors.length) msg += '\n\n' + errors.slice(0, 10).join('\n');
  alert(msg);
  await reload();
  await refreshPartCache();
  e.target.value = '';
}

async function handleExport() {
  if (!selectedIds.value.length) { alert('请先勾选要导出的物料'); return; }
  const headers = ['part_number', 'part_name', 'spec', 'unit', 'category', 'remark'];
  const rows = [];
  for (const id of selectedIds.value) {
    const doc = await getDoc(CONFIG.TABLES.part, id);
    rows.push(headers.map(h => doc[h] ?? ''));
  }
  exportCSV(headers, rows, 'parts');
}
</script>
