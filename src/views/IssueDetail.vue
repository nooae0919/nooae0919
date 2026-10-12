<template>
  <MainLayout>
    <div class="toolbar">
      <button @click="$router.push('/issue')">← 返回列表</button>
    </div>

    <div class="card" v-if="batch">
      <h2>领料单 {{ batch.issue_no }}</h2>
      <div class="wo-meta">
        <span>工单号：<b>{{ batch.wo_number || '-' }}</b></span>
        <span>成品料号：<b>{{ batch.product_number || '-' }}</b></span>
        <span>成品名称：<b>{{ batch.product_name || '-' }}</b></span>
        <span>领料人：<b>{{ batch.operator || '-' }}</b></span>
        <span>领料时间：<b>{{ batch.issue_time || '-' }}</b></span>
        <span>物料种类：<b>{{ batch.items.length }}</b></span>
        <span>领料总数：<b>{{ batch.totalQty }}</b></span>
      </div>
    </div>

    <div class="toolbar" style="margin-top:24px;">
      <h3 style="flex:1;">物料明细</h3>
      <button @click="handleExport">导出CSV</button>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:60px;">序号</th>
          <th>物料料号</th>
          <th>物料名称</th>
          <th>数量</th>
          <th style="width:100px;">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(it, idx) in batch?.items || []" :key="it.$id">
          <td>{{ idx + 1 }}</td>
          <td>{{ it.part_number || '' }}</td>
          <td>{{ it.part_name || '' }}</td>
          <td><b>{{ it.issue_qty ?? '' }}</b></td>
          <td><button @click="deleteItem(it.$id)">删除</button></td>
        </tr>
        <tr v-if="batch && !batch.items.length">
          <td colspan="5" style="text-align:center;color:#999;">暂无明细</td>
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
import { listDocs, deleteDoc } from '../api/db.js';
import { exportCSV } from '../api/csv.js';
import { Query } from 'appwrite';

const props = defineProps({ issueNo: String });
const route = useRoute();
const issueNo = computed(() => props.issueNo || route.params.issueNo);

const batch = ref(null);

async function load() {
  const res = await listDocs(CONFIG.TABLES.issue, [
    Query.equal('issue_no', issueNo.value),
    Query.limit(5000)
  ]);
  const items = res.documents;
  if (!items.length) {
    alert('未找到该领料单');
    return;
  }
  const first = items[0];

  // 补工单信息
  let product_number = '', product_name = '';
  if (first.wo_number) {
    const woRes = await listDocs(CONFIG.TABLES.wo, [
      Query.equal('wo_number', first.wo_number),
      Query.limit(1)
    ]);
    if (woRes.documents.length) {
      product_number = woRes.documents[0].product_number || '';
      product_name = woRes.documents[0].product_name || '';
    }
  }

  batch.value = {
    issue_no: issueNo.value,
    wo_number: first.wo_number,
    operator: first.operator,
    issue_time: first.issue_time,
    product_number,
    product_name,
    items,
    totalQty: items.reduce((s, d) => s + (Number(d.issue_qty) || 0), 0)
  };
}

watch(issueNo, load);

onMounted(() => {
  if (!issueNo.value) { alert('未指定领料单号'); return; }
  load();
});

async function deleteItem(itemId) {
  const ok = window.$confirm
    ? await window.$confirm({ title: '删除确认', message: '确认删除该条明细？' })
    : confirm('确认删除该条明细？');
  if (!ok) return;
  try {
    await deleteDoc(CONFIG.TABLES.issue, itemId);
    await load();
  } catch (e) {
    alert('删除失败：' + e.message);
  }
}

function handleExport() {
  if (!batch.value) return;
  const headers = ['issue_no', 'wo_number', 'part_number', 'part_name', 'issue_qty', 'operator', 'issue_time'];
  const rows = batch.value.items.map(d => headers.map(h => d[h] ?? ''));
  exportCSV(headers, rows, `issue_${batch.value.issue_no}`);
}
</script>
