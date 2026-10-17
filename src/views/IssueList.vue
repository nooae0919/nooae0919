<template>
  <MainLayout>
    <div class="page-header">
      <div class="search-bar">
        <input v-model="searchInput" type="text" placeholder="按单号/工单/领料人搜索..." @keyup.enter="handleSearch">
        <button @click="handleSearch">查询</button>
        <button v-if="keyword" @click="clearSearch" style="background:#f3f4f6;">重置</button>
      </div>
      <ActionMenu :items="menuItems" />
    </div>
    <!-- 表格保持不变，省略以节省空间 -->
    <table>
      <thead>
        <tr>
          <th style="width:44px;"><input type="checkbox" :checked="allSelected" :indeterminate="someSelected" @change="toggleSelectAll"></th>
          <th style="width:60px;">序号</th><th>领料单号</th><th>工单号</th><th>成品料号</th><th>成品名称</th><th>物料种类</th><th>领料总数</th><th>领料人</th><th>领料时间</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(b, idx) in paginatedBatches" :key="b.key">
          <td><input type="checkbox" :value="b.key" v-model="selectedKeys"></td>
          <td>{{ (currentPage - 1) * PAGE_SIZE + idx + 1 }}</td>
          <td>{{ b.issue_no || '(无单号)' }}</td>
          <td>{{ b.wo_number || '' }}</td>
          <td>{{ b.product_number || '' }}</td>
          <td>{{ b.product_name || '' }}</td>
          <td>{{ b.itemCount }} 种</td>
          <td><b>{{ b.totalQty }}</b></td>
          <td>{{ b.operator || '' }}</td>
          <td>{{ b.issue_time || '' }}</td>
        </tr>
        <tr v-if="!loading && !paginatedBatches.length"><td colspan="10" style="text-align:center;color:#999;">暂无领料单</td></tr>
      </tbody>
    </table>
    <Pagination v-model:page="currentPage" :total="total" :loading="loading" />
    <input type="file" accept=".csv" hidden ref="fileInput" @change="handleImport">
    <!-- 弹窗保持原样 -->
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
import { listDocs, createDoc, deleteDoc } from '../api/db.js';
import { exportCSV, readCSV } from '../api/csv.js';
import { syncExcessToInventory } from '../api/kitting.js';
import { partName, loadPartNamesForPage, ensurePart } from '../api/partMap.js';
import { authStore } from '../stores/auth.js';
import { Query } from 'appwrite';

const router = useRouter();
const allIssueNos = ref([]);
const woList = ref([]);
const searchInput = ref('');
const keyword = ref('');
const fileInput = ref(null);
const selectedKeys = ref([]);
const showAdd = ref(false);
const addError = ref('');

const addForm = reactive({ wo_number: '', operator: '', items: [{ part_number: '', part_name: '', issue_qty: '' }] });

const menuItems = computed(() => [
  { label: '新增领料单', onClick: openAdd },
  { label: '详情', onClick: viewSelected, disabled: selectedKeys.value.length !== 1 },
  { label: '删除', onClick: deleteSelected, disabled: selectedKeys.value.length === 0 },
  { label: '导入CSV', onClick: triggerImport },
  { label: '导出CSV', onClick: handleExport, disabled: selectedKeys.value.length === 0 }
]);

function genIssueNo() {
  const d = new Date(); const pad = n => String(n).padStart(2, '0');
  return `IS${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
}
function nowStr() {
  const d = new Date(); const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const woMap = computed(() => { const m = {}; woList.value.forEach(w => m[w.wo_number] = w); return m; });

const { currentPage, paginatedItems: paginatedBatches, total, loading, reload } =
  usePagination([], {
    mode: 'server',
    pageSize: PAGE_SIZE,
    fetcher: async ({ page, pageSize }) => {
      // 因为按单号聚合，这里仍然全量拉取明细做聚合（如果以后数据量太大，建议建单据头表）
      const all = [];
      let offset = 0;
      while (true) {
        const res = await listDocs(CONFIG.TABLES.issue, [Query.limit(500), Query.offset(offset)]);
        all.push(...res.documents);
        if (res.documents.length < 500) break;
        offset += 500;
      }
      allIssueNos.value = all;

      const batchMap = {};
      all.forEach(d => {
        const key = d.issue_no ? `NO:${d.issue_no}` : `FB:${d.wo_number}|${d.operator || ''}|${d.issue_time || ''}`;
        if (!batchMap[key]) batchMap[key] = { key, issue_no: d.issue_no || '', wo_number: d.wo_number, operator: d.operator, issue_time: d.issue_time, itemCount: 0, totalQty: 0, _ids: [] };
        batchMap[key].itemCount++;
        batchMap[key].totalQty += Number(d.issue_qty) || 0;
        batchMap[key]._ids.push(d.$id);
      });

      let batches = Object.values(batchMap);
      // ⭐ 只有点击查询时 keyword 才有值，触发前端过滤
      if (keyword.value) {
        const kw = keyword.value.toLowerCase();
        batches = batches.filter(b => (b.issue_no || '').toLowerCase().includes(kw) || (b.wo_number || '').toLowerCase().includes(kw) || (b.operator || '').toLowerCase().includes(kw));
      }
      batches.sort((a, b) => (b.issue_time || '').localeCompare(a.issue_time || ''));

      const totalCount = batches.length;
      const pageBatches = batches.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

      pageBatches.forEach(b => {
        const w = woMap.value[b.wo_number];
        b.product_number = w?.product_number || '';
        b.product_name = w?.product_name || '';
      });
      return { items: pageBatches, total: totalCount };
    },
  });

function handleSearch() {
  keyword.value = searchInput.value.trim();
  if (currentPage.value !== 1) currentPage.value = 1;
  else reload();
}
function clearSearch() { searchInput.value = ''; handleSearch(); }

async function loadWos() { const res = await listDocs(CONFIG.TABLES.wo, [Query.limit(5000)]); woList.value = res.documents; }
onMounted(async () => { await loadWos(); await reload(); });

// 剩下的 check、add、delete、export 方法逻辑保持不变... (略)
</script>
