<template>
  <MainLayout>
    <div class="page-header">
      <div class="page-title">BOM 详情</div>
      <button @click="$router.push('/bom')">返回列表</button>
    </div>

    <!-- BOM 头信息 -->
    <div class="card" v-if="bom">
      <h2>
        {{ bom.product_number }}
        <small style="color:#999;font-size:14px;">({{ bom.version }})</small>
      </h2>
      <div class="wo-meta">
        <span>成品料号：<b>{{ bom.product_number || '-' }}</b></span>
        <span>成品名称：<b>{{ bom.product_name || '-' }}</b></span>
        <span>版本号：<b>{{ bom.version || '-' }}</b></span>
        <span>备注：<b>{{ bom.remark || '-' }}</b></span>
        <span>更新时间：<b>{{ formatTime(bom.$updatedAt) }}</b></span>
      </div>
    </div>

    <!-- 明细表（只读） -->
    <div class="toolbar" style="margin-top:24px;">
      <h3 style="flex:1;">BOM 明细（{{ items.length }} 条）</h3>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:60px;">序号</th>
          <th>物料料号</th>
          <th>物料名称</th>
          <th>单板用量</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(it, idx) in paginatedItems" :key="it.$id">
          <td>{{ (currentPage - 1) * PAGE_SIZE + idx + 1 }}</td>
          <td>{{ it.part_number || '' }}</td>
          <td>{{ it.part_name || '' }}</td>
          <td><b>{{ it.qty_per_board ?? '' }}</b></td>
        </tr>
        <tr v-if="!items.length">
          <td colspan="4" style="text-align:center;color:#999;">暂无明细</td>
        </tr>
      </tbody>
    </table>
    <Pagination v-model:page="currentPage" :total="items.length" />
  </MainLayout>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import Pagination from '../components/Pagination.vue';
import { PAGE_SIZE, usePagination } from '../composables/usePagination.js';
import { CONFIG } from '../config.js';
import { listDocs, getDoc } from '../api/db.js';
import { Query } from 'appwrite';

const props = defineProps({ id: String });
const route = useRoute();
const bomId = computed(() => props.id || route.params.id);

const bom = ref(null);
const items = ref([]);
const { currentPage, paginatedItems } = usePagination(items);

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadBom() {
  bom.value = await getDoc(CONFIG.TABLES.bom, bomId.value);
}
async function loadItems() {
  const res = await listDocs(CONFIG.TABLES.bomItem, [
    Query.equal('bom_id', bomId.value),
    Query.orderAsc('part_number'),
    Query.limit(5000)
  ]);
  items.value = res.documents;
}
async function loadAll() { await loadBom(); await loadItems(); }
watch(bomId, loadAll);

onMounted(() => {
  if (!bomId.value) { alert('未指定 BOM ID'); return; }
  loadAll();
});
</script>
