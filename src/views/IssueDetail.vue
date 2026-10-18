<template>
  <MainLayout>
    <div class="page-header">
      <div class="page-title">领料单详情</div>
      <button @click="$router.push('/issue')">返回列表</button>
    </div>

    <div class="card" v-if="batch">
      <h2>领料单 {{ batch.issue_no }}</h2>
      <div class="wo-meta">
        <span>工单号：<b>{{ batch.wo_number || '-' }}</b></span>
        <span>成品料号：<b>{{ batch.product_number || '-' }}</b></span>
        <span>成品名称：<b>{{ batch.product_name || '-' }}</b></span>
        <span>领料人：<b>{{ batch.operator || '-' }}</b></span>
        <span>领料时间：<b>{{ batch.issue_time || '-' }}</b></span>
        <span>物料种类：<b>{{ total }}</b></span>
        <span>领料总数：<b>{{ batch.totalQty }}</b></span>
      </div>
    </div>

    <table>
      <thead><tr><th style="width:60px;">序号</th><th>物料料号</th><th>物料名称</th><th>数量</th></tr></thead>
      <tbody>
        <tr v-for="(it, idx) in paginatedItems" :key="it.$id">
          <td>{{ (currentPage - 1) * PAGE_SIZE + idx + 1 }}</td>
          <td>{{ it.part_number || '' }}</td>
          <td>{{ partName(it.part_number) }}</td>
          <td><b>{{ it.issue_qty ?? '' }}</b></td>
        </tr>
        <tr v-if="!loading && !paginatedItems.length"><td colspan="4" style="text-align:center;color:#999;">暂无明细</td></tr>
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
import { partName, loadPartNamesForPage } from '../api/partMap.js';
import { Query } from 'appwrite';

const props = defineProps({ issueNo: String });
const route = useRoute();
const issueNo = computed(() => props.issueNo || route.params.issueNo);
const batch = ref(null);

const { currentPage, paginatedItems, total, loading, reload } =
  usePagination([], {
    mode: 'server',
    pageSize: PAGE_SIZE,
    fetcher: async ({ page, pageSize }) => {
      const no = issueNo.value;
      if (!no) return { items: [], total: 0 };

      const res = await listDocs(CONFIG.TABLES.issue, [Query.equal('issue_no', no), Query.orderAsc('part_number'), Query.limit(pageSize), Query.offset((page - 1) * pageSize)]);
      await loadPartNamesForPage(res.documents);

      if (!batch.value) {
        const firstRes = await listDocs(CONFIG.TABLES.issue, [Query.equal('issue_no', no), Query.limit(1)]);
        const first = firstRes.documents[0];
        if (!first) { batch.value = null; return { items: [], total: 0 }; }
        let product_number = '', product_name = '';
        if (first.wo_number) {
          const woRes = await listDocs(CONFIG.TABLES.wo, [Query.equal('wo_number', first.wo_number), Query.limit(1)]);
          if (woRes.documents.length) { product_number = woRes.documents[0].product_number || ''; product_name = woRes.documents[0].product_name || ''; }
        }
        batch.value = { issue_no: no, wo_number: first.wo_number, operator: first.operator, issue_time: first.issue_time, product_number, product_name, totalQty: 0 };
        let all = [], offset = 0;
        while (true) {
          const r = await listDocs(CONFIG.TABLES.issue, [Query.equal('issue_no', no), Query.limit(500), Query.offset(offset)]);
          all.push(...r.documents);
          if (r.documents.length < 500) break;
          offset += 500;
        }
        batch.value.totalQty = all.reduce((s, d) => s + (Number(d.issue_qty) || 0), 0);
      }
      return { items: res.documents, total: res.total };
    },
  });

watch(issueNo, () => { batch.value = null; reload(); });
onMounted(() => { if (issueNo.value) reload(); });
</script>
