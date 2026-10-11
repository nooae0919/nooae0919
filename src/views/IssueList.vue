<template>
  <MainLayout>
    <div class="toolbar">
      <button @click="handleExportAll">导出全部领料记录</button>
      <button @click="load">刷新</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>工单号</th><th>成品料号</th><th>产品名称</th><th>计划数量</th>
          <th>已领料种类</th><th>已领料总数</th><th>状态</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="wo in docs" :key="wo.$id">
          <td>{{ wo.wo_number || '' }}</td>
          <td>{{ wo.product_number || '' }}</td>
          <td>{{ wo.product_name || '' }}</td>
          <td>{{ wo.plan_qty ?? '' }}</td>
          <td>{{ partCount(wo.wo_number) }}</td>
          <td>{{ totalQty(wo.wo_number) }}</td>
          <td>{{ statusText(wo.status) }}</td>
          <td>
            <button @click="goDetail(wo.wo_number)">查看明细</button>
          </td>
        </tr>
      </tbody>
    </table>
  </MainLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import { CONFIG } from '../config.js';
import { listDocs } from '../api/db.js';
import { exportCSV } from '../api/csv.js';
import { Query } from 'appwrite';

const router = useRouter();
const docs = ref([]);
const summaryMap = ref({});

function statusText(s) {
  return s === 'completed' ? '已完成' : s === 'in_progress' ? '生产中' : '待生产';
}
function partCount(wo) { return summaryMap.value[wo]?.partSet.size || 0; }
function totalQty(wo) { return summaryMap.value[wo]?.totalQty || 0; }

async function load() {
  const [woRes, issueRes] = await Promise.all([
    listDocs(CONFIG.TABLES.wo, [Query.limit(500)]),
    listDocs(CONFIG.TABLES.issue, [Query.limit(5000)])
  ]);
  docs.value = woRes.documents;

  const map = {};
  issueRes.documents.forEach(d => {
    const wo = d.wo_number; if (!wo) return;
    if (!map[wo]) map[wo] = { partSet: new Set(), totalQty: 0 };
    map[wo].partSet.add(d.part_number);
    map[wo].totalQty += Number(d.issue_qty) || 0;
  });
  summaryMap.value = map;
}

function goDetail(wo) {
  router.push({ name: 'issue-detail', params: { wo } });
}

async function handleExportAll() {
  const res = await listDocs(CONFIG.TABLES.issue, [Query.limit(5000)]);
  const headers = ['wo_number', 'part_number', 'part_name', 'issue_qty', 'operator', 'issue_time'];
  const rows = res.documents.map(d => headers.map(h => d[h] ?? ''));
  exportCSV(headers, rows, 'issue_records_all');
}

onMounted(load);
</script>
