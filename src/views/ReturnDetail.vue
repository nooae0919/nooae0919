<template>
  <MainLayout>
    <div class="toolbar">
      <button @click="$router.push('/return')">← 返回列表</button>
    </div>

    <div class="card" v-if="wo">
      <h2>工单 {{ wo.wo_number }}</h2>
      <div class="wo-meta">
        <span>成品料号：<b>{{ wo.product_number || '-' }}</b></span>
        <span>产品名称：<b>{{ wo.product_name || '-' }}</b></span>
        <span>计划数量：<b>{{ wo.plan_qty ?? '-' }}</b></span>
        <span>生产日期：<b>{{ wo.produce_date || '-' }}</b></span>
        <span>状态：<b>{{ statusText(wo.status) }}</b></span>
      </div>
    </div>

    <div class="toolbar" style="margin-top:24px;">
      <h3 style="flex:1;">退料记录</h3>
      <button @click="triggerImport">导入CSV</button>
      <button @click="handleExport">导出CSV</button>
      <input type="file" accept=".csv" hidden ref="fileInput" @change="handleImport">
    </div>
    <table>
      <thead>
        <tr>
          <th>物料料号</th><th>物料名称</th><th>退料数量</th>
          <th>退料人</th><th>退料时间</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in returns" :key="d.$id">
          <td>{{ d.part_number || '' }}</td>
          <td>{{ d.part_name || '' }}</td>
          <td>{{ d.return_qty ?? '' }}</td>
          <td>{{ d.operator || '' }}</td>
          <td>{{ d.return_time || '' }}</td>
          <td><button @click="deleteRow(d.$id)">删除</button></td>
        </tr>
      </tbody>
    </table>

    <div class="toolbar" style="margin-top:24px;">
      <h3 style="flex:1;">按物料汇总</h3>
    </div>
    <table>
      <thead>
        <tr><th>物料料号</th><th>物料名称</th><th>累计退料数量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in summaryRows" :key="row.part_number">
          <td>{{ row.part_number }}</td>
          <td>{{ row.part_name }}</td>
          <td><b>{{ row.total }}</b></td>
        </tr>
        <tr v-if="!summaryRows.length">
          <td colspan="3" style="text-align:center;color:#999;">暂无退料记录</td>
        </tr>
      </tbody>
    </table>
  </MainLayout>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import { CONFIG } from '../config.js';
import { listDocs, createDoc, deleteDoc } from '../api/db.js';
import { exportCSV, readCSV } from '../api/csv.js';
import { Query } from 'appwrite';

const props = defineProps({ wo: String });
const route = useRoute();
const woNumber = computed(() => props.wo || route.params.wo);

const wo = ref(null);
const returns = ref([]);
const fileInput = ref(null);

function statusText(s) {
  return s === 'completed' ? '已完成' : s === 'in_progress' ? '生产中' : '待生产';
}

const summaryRows = computed(() => {
  const map = {};
  returns.value.forEach(d => {
    const key = d.part_number || '';
    if (!map[key]) map[key] = { part_name: d.part_name || '', total: 0 };
    map[key].total += Number(d.return_qty) || 0;
  });
  return Object.entries(map).map(([part_number, v]) => ({ part_number, ...v }));
});

async function loadWo() {
  const res = await listDocs(CONFIG.TABLES.wo, [
    Query.equal('wo_number', woNumber.value), Query.limit(1)
  ]);
  if (!res.documents.length) { alert('未找到该工单'); return; }
  wo.value = res.documents[0];
}
async function loadReturns() {
  const res = await listDocs(CONFIG.TABLES.return, [
    Query.equal('wo_number', woNumber.value),
    Query.orderDesc('return_time'),
    Query.limit(5000)
  ]);
  returns.value = res.documents;
}
async function loadAll() { await loadWo(); await loadReturns(); }
watch(woNumber, loadAll);

onMounted(() => {
  if (!woNumber.value) { alert('未指定工单号'); return; }
  loadAll();
});

function triggerImport() { fileInput.value.click(); }
async function handleImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);
  let ok = 0, fail = 0;
  for (const row of rows) {
    const data = {};
    headers.forEach((h, i) => {
      const v = row[i];
      if (v === undefined || v === null || v === '') return;
      if (h === 'return_qty') {
        const n = Number(v); if (isNaN(n)) return;
        data[h] = n;
      } else {
        data[h] = String(v).trim();
      }
    });
    data.wo_number = woNumber.value;
    try { await createDoc(CONFIG.TABLES.return, data); ok++; }
    catch (err) { console.error(err); fail++; }
  }
  alert(`导入完成：成功 ${ok} 条，失败 ${fail} 条`);
  await loadReturns();
  e.target.value = '';
}
async function deleteRow(docId) {
  if (!confirm('确认删除该退料记录？')) return;
  try {
    await deleteDoc(CONFIG.TABLES.return, docId);
    await loadReturns();
  } catch (e) { alert('删除失败：' + e.message); }
}
function handleExport() {
  const headers = ['wo_number', 'part_number', 'part_name', 'return_qty', 'operator', 'return_time'];
  const rows = returns.value.map(d => headers.map(h => d[h] ?? ''));
  exportCSV(headers, rows, `return_${woNumber.value}`);
}
</script>
