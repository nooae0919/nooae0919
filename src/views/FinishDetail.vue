<template>
  <MainLayout>
    <div class="page-header">
      <div class="page-title">入库单详情</div>
      <button @click="$router.push('/finish')">返回列表</button>
    </div>

    <div class="card" v-if="batch">
      <h2>入库单 {{ batch.finish_no }}</h2>
      <div class="wo-meta">
        <span>工单号：<b>{{ batch.wo_number || '-' }}</b></span>
        <span>成品料号：<b>{{ batch.product_number || '-' }}</b></span>
        <span>成品名称：<b>{{ batch.product_name || '-' }}</b></span>
        <span>入库人：<b>{{ batch.operator || '-' }}</b></span>
        <span>入库时间：<b>{{ batch.finished_at || '-' }}</b></span>
        <span>物料种类：<b>{{ batch.items.length }}</b></span>
        <span>入库总数：<b>{{ batch.totalQty }}</b></span>
      </div>
    </div>

    <div class="toolbar" style="margin-top:24px;">
      <h3 style="flex:1;">成品明细</h3>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:60px;">序号</th>
          <th>成品料号</th>
          <th>成品名称</th>
          <th>数量</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(it, idx) in batch?.items || []" :key="it.$id">
          <td>{{ idx + 1 }}</td>
          <td>{{ it.product_number || '' }}</td>
          <td>{{ it.product_name || '' }}</td>
          <td><b>{{ it.finish_qty ?? '' }}</b></td>
        </tr>
        <tr v-if="batch && !batch.items.length">
          <td colspan="4" style="text-align:center;color:#999;">暂无明细</td>
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
import { listDocs } from '../api/db.js';
import { Query } from 'appwrite';

const props = defineProps({ finishNo: String });
const route = useRoute();
const finishNo = computed(() => props.finishNo || route.params.finishNo);

const batch = ref(null);

async function load() {
  const res = await listDocs(CONFIG.TABLES.finish, [
    Query.equal('finish_no', finishNo.value),
    Query.limit(5000)
  ]);
  const items = res.documents;
  if (!items.length) {
    alert('未找到该入库单');
    return;
  }
  const first = items[0];

  let product_number = first.product_number || '';
  let product_name = first.product_name || '';
  // 如果明细里没有成品信息，去工单表兜底
  if ((!product_number || !product_name) && first.wo_number) {
    const woRes = await listDocs(CONFIG.TABLES.wo, [
      Query.equal('wo_number', first.wo_number),
      Query.limit(1)
    ]);
    if (woRes.documents.length) {
      product_number = product_number || woRes.documents[0].product_number || '';
      product_name = product_name || woRes.documents[0].product_name || '';
    }
  }

  batch.value = {
    finish_no: finishNo.value,
    wo_number: first.wo_number,
    operator: first.operator,
    finished_at: first.finished_at,
    product_number,
    product_name,
    items,
    totalQty: items.reduce((s, d) => s + (Number(d.finish_qty) || 0), 0)
  };
}

watch(finishNo, load);

onMounted(() => {
  if (!finishNo.value) {
    alert('未指定入库单号');
    return;
  }
  load();
});
</script>
