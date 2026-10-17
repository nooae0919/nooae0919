<template>
  <MainLayout>
    <!-- 把搜索栏这一块直接换成这样，没有任何花哨的样式，就是一个纯按钮 -->
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <div style="display: flex; gap: 8px; align-items: center; flex: 1;">
        <input 
          v-model="searchInput" 
          type="text" 
          placeholder="按料号 / 名称 / 规格搜索..." 
          @keyup.enter="handleSearch"
          style="width: 300px; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;"
        >
        <!-- 就加这个按钮 -->
        <button @click="handleSearch" style="padding: 8px 16px; background: blue; color: white; border: none; border-radius: 6px;">查 询</button>
      </div>
      <ActionMenu :items="menuItems" />
    </div>

    <!-- 下面的表格保留你原来的代码，不用动 -->
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

    <!-- 下面的弹窗和文件上传保持原样 -->
    <!-- ... -->
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
import { Query } from 'appwrite';

const searchInput = ref(''); // 绑定的输入框
const keyword = ref('');     // 实际触发的查询条件
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
      // 只有在点击查询后 keyword 才有值，才会去后台过滤
      if (keyword.value) {
        queries.unshift(Query.search('part_number', keyword.value));
      }
      const res = await listDocs(CONFIG.TABLES.part, queries);
      return { items: res.documents, total: res.total };
    },
  });

// 点击查询触发的方法
function handleSearch() {
  keyword.value = searchInput.value.trim();
  if (currentPage.value !== 1) {
    currentPage.value = 1;
  } else {
    reload();
  }
}

// 重置按钮
function clearSearch() {
  searchInput.value = '';
  handleSearch();
}

onMounted(async () => {
  await reload();
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
  } catch (e) {
    formError.value = '保存失败：' + (e.message || e);
  }
}

async function deleteSelected() {
  if (!selectedIds.value.length) return;
  if (!confirm(`将删除 ${selectedIds.value.length} 条物料主数据，确认？`)) return;
  let ok2 = 0, fail = 0;
  for (const id of selectedIds.value) {
    try { await deleteDoc(CONFIG.TABLES.part, id); ok2++; }
    catch (e) { fail++; }
  }
  selectedIds.value = [];
  await reload();
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
    if (!data.part_name) data.part_name = ''; // 兜底防报错
    
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
