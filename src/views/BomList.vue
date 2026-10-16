<template>
  <MainLayout>
    <div class="page-header">
      <div class="search-bar">
        <input v-model="keyword" type="text" placeholder="按成品料号 / 名称 / 版本搜索...">
      </div>
      <ActionMenu :items="menuItems" />
    </div>

    <table id="bom-table">
      <thead>
        <tr>
          <th style="width:44px;">
            <input type="checkbox" :checked="allSelected" :indeterminate="someSelected" @change="toggleSelectAll">
          </th>
          <th style="width:60px;">序号</th>
          <th>成品料号</th>
          <th>成品名称</th>
          <th>版本号</th>
          <th style="width:120px;">BOM条目数</th>
          <th>更新时间</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(d, idx) in paginatedDocs" :key="d.$id">
          <td><input type="checkbox" :value="d.$id" v-model="selectedIds"></td>
          <td>{{ (currentPage - 1) * PAGE_SIZE + idx + 1 }}</td>
          <td>{{ d.product_number || '' }}</td>
          <td>{{ d.product_name || '' }}</td>
          <td>{{ d.version || '' }}</td>
          <td>{{ itemCountMap[d.$id] || 0 }}</td>
          <td>{{ formatTime(d.$updatedAt) }}</td>
        </tr>
        <tr v-if="!filteredDocs.length">
          <td colspan="7" style="text-align:center;color:#999;">
            暂无 BOM 数据，请点击"操作 → 导入CSV"上传
          </td>
        </tr>
      </tbody>
    </table>
    <Pagination v-model:page="currentPage" :total="filteredDocs.length" />

    <input type="file" accept=".csv" hidden ref="fileInput" @change="handleImport">
  </MainLayout>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import ActionMenu from '../components/ActionMenu.vue';
import Pagination from '../components/Pagination.vue';
import { PAGE_SIZE, usePagination } from '../composables/usePagination.js';
import { CONFIG } from '../config.js';
import { listDocs, createDoc, deleteDoc } from '../api/db.js';
import { exportCSV, readCSV } from '../api/csv.js';
import { Query } from 'appwrite';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const router = useRouter();

const docs = ref([]);
const itemCountMap = ref({});
const keyword = ref('');
const fileInput = ref(null);
const selectedIds = ref([]);

/* ⭐ 操作菜单 */
const menuItems = computed(() => [
  { label: '详情', onClick: viewSelected, disabled: selectedIds.value.length !== 1 },
  { label: '删除', onClick: deleteSelected, disabled: selectedIds.value.length === 0 },
  { label: '导入CSV', onClick: triggerImport },
  { label: '导出CSV', onClick: handleExport, disabled: selectedIds.value.length === 0 }
]);

const filteredDocs = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return docs.value;
  return docs.value.filter(d =>
    (d.product_number || '').toLowerCase().includes(kw) ||
    (d.product_name || '').toLowerCase().includes(kw) ||
    (d.version || '').toLowerCase().includes(kw)
  );
});
const { currentPage, paginatedItems: paginatedDocs } = usePagination(filteredDocs);

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

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function load() {
  const res = await listDocs(CONFIG.TABLES.bom, [
    Query.limit(5000),
    Query.orderDesc('$updatedAt')
  ]);
  docs.value = res.documents;
  const itemRes = await listDocs(CONFIG.TABLES.bomItem, [Query.limit(10000)]);
  const map = {};
  itemRes.documents.forEach(it => {
    const id = it.bom_id; if (!id) return;
    map[id] = (map[id] || 0) + 1;
  });
  itemCountMap.value = map;
  const valid = new Set(docs.value.map(d => d.$id));
  selectedIds.value = selectedIds.value.filter(id => valid.has(id));
}
onMounted(load);

/* 详情（勾选 1 行） */
function viewSelected() {
  if (selectedIds.value.length !== 1) return;
  router.push({ name: 'bom-detail', params: { id: selectedIds.value[0] } });
}

/* 删除（勾选 ≥1 行） */
async function deleteSelected() {
  if (!selectedIds.value.length) return;
  const targets = docs.value.filter(d => selectedIds.value.includes(d.$id));
  const ok = window.$confirm
    ? await window.$confirm({
        title: '删除确认',
        message: `将删除已勾选的 ${targets.length} 张 BOM 及其全部明细，确认？`
      })
    : confirm(`将删除 ${targets.length} 张 BOM，确认？`);
  if (!ok) return;

  let ok2 = 0, fail = 0;
  for (const b of targets) {
    try {
      const items = await listDocs(CONFIG.TABLES.bomItem, [
        Query.equal('bom_id', b.$id), Query.limit(5000)
      ]);
      for (const it of items.documents) await deleteDoc(CONFIG.TABLES.bomItem, it.$id);
      await deleteDoc(CONFIG.TABLES.bom, b.$id);
      ok2++;
    } catch (e) {
      console.error('删除失败', b.product_number, e); fail++;
    }
  }
  selectedIds.value = [];
  await load();
  if (fail > 0) alert(`删除完成：成功 ${ok2} 张，失败 ${fail} 张`);
}

/* 导入 */
function triggerImport() { fileInput.value.click(); }

async function handleImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);

  const required = ['成品料号', '成品名称', '版本号', '物料料号', '物料名称', '单板用量'];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    alert('CSV 缺少必需列：' + missing.join('、') +
          '\n\n模板列应为：\n序号,成品料号,成品名称,版本号,物料料号,物料名称,单板用量');
    e.target.value = '';
    return;
  }

  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });

  const existingBomRes = await listDocs(CONFIG.TABLES.bom, [Query.limit(10000)]);
  const bomKeyToId = {};
  existingBomRes.documents.forEach(b => {
    const key = `${b.product_number || ''}|${b.product_name || ''}|${b.version || ''}`;
    bomKeyToId[key] = b.$id;
  });

  let okBom = 0, okItem = 0, fail = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const product_number = String(row[idx['成品料号']] || '').trim();
    const product_name = String(row[idx['成品名称']] || '').trim();
    const version = String(row[idx['版本号']] || '').trim();
    const part_number = String(row[idx['物料料号']] || '').trim();
    const part_name = String(row[idx['物料名称']] || '').trim();
    const qtyRaw = row[idx['单板用量']];

    if (!product_number || !version || !part_number) {
      errors.push(`第 ${i + 2} 行：成品料号 / 版本号 / 物料料号 不能为空`); fail++; continue;
    }
    const qty = Number(qtyRaw);
    if (isNaN(qty)) {
      errors.push(`第 ${i + 2} 行：单板用量不是数字（${qtyRaw}）`); fail++; continue;
    }

    const bomKey = `${product_number}|${product_name}|${version}`;

    try {
      let bomId = bomKeyToId[bomKey];
      if (!bomId) {
        const newBom = await createDoc(CONFIG.TABLES.bom, {
          product_number, product_name, version, remark: ''
        });
        bomId = newBom.$id;
        bomKeyToId[bomKey] = bomId;
        okBom++;
        await sleep(30);
      }
      await createDoc(CONFIG.TABLES.bomItem, {
        bom_id: bomId,
        product_number, product_name, version,
        part_number, part_name,
        qty_per_board: qty
      });
      okItem++;
      await sleep(30);
    } catch (err) {
      errors.push(`第 ${i + 2} 行：${err.message}`); fail++;
    }
  }

  let msg = `导入完成：\n- 新建 BOM 头：${okBom} 张\n- 写入 BOM 明细：${okItem} 条\n- 失败：${fail} 条`;
  if (errors.length) {
    msg += '\n\n失败明细（前 10 条）：\n' + errors.slice(0, 10).join('\n');
    if (errors.length > 10) msg += `\n...还有 ${errors.length - 10} 条`;
  }
  alert(msg);

  await load();
  e.target.value = '';
}

/* 导出（勾选 ≥1 行） */
async function handleExport() {
  if (!selectedIds.value.length) { alert('请先勾选要导出的 BOM'); return; }

  let allItems = [];
  const chunkSize = 100;
  for (let i = 0; i < selectedIds.value.length; i += chunkSize) {
    const chunk = selectedIds.value.slice(i, i + chunkSize);
    const res = await listDocs(CONFIG.TABLES.bomItem, [
      Query.equal('bom_id', chunk), Query.limit(20000)
    ]);
    allItems = allItems.concat(res.documents);
  }

  const itemsByBom = {};
  allItems.forEach(it => {
    const id = it.bom_id; if (!id) return;
    if (!itemsByBom[id]) itemsByBom[id] = [];
    itemsByBom[id].push(it);
  });

  const selectedBoms = docs.value.filter(d => selectedIds.value.includes(d.$id));

  const headers = ['序号', '成品料号', '成品名称', '版本号', '物料料号', '物料名称', '单板用量'];
  const data = [];
  let seq = 1;

  for (const b of selectedBoms) {
    const items = (itemsByBom[b.$id] || []).slice().sort((x, y) =>
      (x.part_number || '').localeCompare(y.part_number || '')
    );
    for (const it of items) {
      data.push([
        seq++,
        it.product_number || b.product_number || '',
        it.product_name || b.product_name || '',
        it.version || b.version || '',
        it.part_number || '',
        it.part_name || '',
        it.qty_per_board ?? ''
      ]);
    }
  }

  if (!data.length) { alert('所选 BOM 没有明细可导出'); return; }
  exportCSV(headers, data, 'bom_selected');
}
</script>
