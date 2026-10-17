<template>
  <MainLayout>
    <div class="page-header">
      <div class="page-title">退料单详情</div>
      <button @click="$router.push('/return')">返回列表</button>
    </div>

    <div class="card" v-if="batch">
      <h2>退料单 {{ batch.return_no }}</h2>
      <div class="wo-meta">
        <span>工单号：<b>{{ batch.wo_number || '-' }}</b></span>
        <span>成品料号：<b>{{ batch.product_number || '-' }}</b></span>
        <span>成品名称：<b>{{ batch.product_name || '-' }}</b></span>
        <span>退料人：<b>{{ batch.operator || '-' }}</b></span>
        <span>退料时间：<b>{{ batch.return_time || '-' }}</b></span>
        <span>物料种类：<b>{{ total }}</b></span>
        <span>退料总数：<b>{{ batch.totalQty }}</b></span>
      </div>
    </div>

    <div class="toolbar" style="margin-top:24px;">
      <h3 style="flex:1;">物料明细</h3>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:60px;">序号</th>
          <th>物料料号</th>
          <th>物料名称</th>
          <th>数量</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(it, idx) in paginatedItems" :key="it.$id">
          <td>{{ (currentPage - 1) * PAGE_SIZE + idx + 1 }}</td>
          <td>{{ it.part_number || '' }}</td>
          <td>{{ partName(it.part_number) }}</td>
          <td><b>{{ it.return_qty ?? '' }}</b></td>
        </tr>
        <tr v-if="!loading && !paginatedItems.length">
          <td colspan="4" style="text-align:center;color:#999;">暂无明细</td>
        </tr>
      </tbody>
    </table>
    <Pagination v-model:page="currentPage" :total="total" :loading="loading" />
  </MainLayout>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import Pagination from '../components/Pagination.vue';
import { PAGE_SIZE, usePagination } from '../composables/usePagination.js';
import { CONFIG } from '../config.js';
import { listDocs } from '../api/db.js';
import { partName, getPartMap } from '../api/partMap.js';
import { Query } from 'appwrite';

const props = defineProps({ returnNo: String });
const route = useRoute();
const returnNo = computed(() => props.returnNo || route.params.returnNo);

const batch = ref(null);

const { currentPage, paginatedItems, total, loading, reload } =
  usePagination([], {
    mode: 'server',
    pageSize: PAGE_SIZE,
    fetcher: async ({ page, pageSize }) => {
      const no = returnNo.value;
      if (!no) return { items: [], total: 0 };

      const res = await listDocs(CONFIG.TABLES.return, [
        Query.equal('return_no', no),
        Query.orderAsc('part_number'),
        Query.limit(pageSize),
        Query.offset((page - 1) * pageSize),
      ]);

      if (!batch.value) {
        const firstRes = await listDocs(CONFIG.TABLES.return, [
          Query.equal('return_no', no),
          Query.limit(1)
        ]);
        const first = firstRes.documents[0];
        if (!first) { batch.value = null; return { items: [], total: 0 }; }

        let product_number = '', product_name = '';
        if (first.wo_number) {
          const woRes = await listDocs(CONFIG.TABLES.wo, [
            Query.equal('wo_number', first.wo_number), Query.limit(1)
          ]);
          if (woRes.documents.length) {
            product_number = woRes.documents[0].product_number || '';
            product_name = woRes.documents[0].product_name || '';
          }
        }
        batch.value = {
          return_no: no,
          wo_number: first.wo_number,
          operator: first.operator,
          return_time: first.return_time,
          product_number,
          product_name,
          totalQty: 0,
        };
        let all = [], offset = 0, chunk = 500;
        while (true) {
          const r = await listDocs(CONFIG.TABLES.return, [
            Query.equal('return_no', no),
            Query.limit(chunk), Query.offset(offset)
          ]);
          all.push(...r.documents);
          if (r.documents.length < chunk) break;
          offset += chunk;
        }
        batch.value.totalQty = all.reduce((s, d) => s + (Number(d.return_qty) || 0), 0);
      }

      return { items: res.documents, total: res.total };
    },
  });

watch(returnNo, () => { batch.value = null; reload(); });

onMounted(async () => {
  if (!returnNo.value) { alert('未指定退料单号'); return; }
  await getPartMap();
  reload();
});
</script>
