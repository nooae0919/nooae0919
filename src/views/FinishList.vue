<template>
  <MainLayout>
    <div class="toolbar">
      <button @click="handleExportAll">导出全部入库记录</button>
      <button @click="load">刷新</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>工单号</th><th>成品料号</th><th>产品名称</th><th>计划数量</th>
          <th>已入库</th><th>未入库</th><th>进度</th><th>状态</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="wo in docs" :key="wo.$id">
          <td>{{ wo.wo_number || '' }}</td>
          <td>{{ wo.product_number || '' }}</td>
          <td>{{ wo.product_name || '' }}</td>
          <td>{{ planQty(wo) }}</td>
          <td style="color:#2563eb;font-weight:600;">{{ finishedQty(wo.wo_number) }}</td>
          <td :style="{ color: remainQty(wo) > 0 ? '#d33' : '#16a34a', fontWeight: 600 }">
            {{ remainQty(wo) }}
          </td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;min-width:140px;">
              <div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
                <div :style="{
                  width: percent(wo) + '%',
                  height: '100%',
                  background: percent(wo) >= 100 ? '#16a34a' : percent(wo) > 0 ? '#2563eb' : '#e5e7eb',
                  transition: 'width .3s'
                }"></div>
              </div>
              <span style="font-size:12px;color:#666;min-width:36px;">{{ percent(wo) }}%</span>
            </div>
          </td>
          <td>{{ statusText(wo.status) }}</td>
          <td><button @click="goDetail(wo.wo_number)">查看明细</button></td>
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
function planQty(wo) { return Number(wo.plan_qty) || 0; }
function finishedQty(wo) { return summaryMap.value[wo] || 0; }
function remainQty(wo) { return Math.max(planQty(wo) - finishedQty(wo.wo_number), 0); }
function percent(wo) {
  const p = planQty(wo);
  return p > 0 ? Math.min(Math.round(finishedQty(wo.wo_number) / p * 100), 100) : 0;
}

async function load() {
  const [woRes, finishRes] = await Promise.all([
    listDocs(CONFIG.TABLES.wo, [Query.limit(500)]),
    listDocs(CONFIG.TABLES.finish, [Query.limit(5000)])
  ]);
  docs.value = woRes.documents;

  const map = {};
  finishRes.documents.forEach(d => {
    const wo = d.wo_number; if (!wo) return;
    map[wo] = (map[wo] || 0) + (Number(d.finish_qty) || 0);
  });
  summaryMap.value = map;
}

function goDetail(wo) {
  router.push({ name: 'finish-detail', params: { wo } });
}
async function handleExportAll() {
  const res = await listDocs(CONFIG.TABLES.finish, [Query.limit(5000)]);
  const headers = ['wo_number', 'product_number', 'finish_qty', 'operator', 'finished_at'];
  const rows = res.documents.map(d => headers.map(h => d[h] ?? ''));
  exportCSV(headers, rows, 'finish_records_all');
}

onMounted(load);
</script>
