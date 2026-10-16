<template>
  <MainLayout>
    <div class="page-header">
      <div class="search-bar">
        <input v-model="keyword" type="text" placeholder="按物料料号或名称搜索...">
      </div>
      <ActionMenu :items="menuItems" />
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:60px;">序号</th>
          <th>物料料号</th>
          <th>物料名称</th>
          <th>库存总数量</th>
          <th>库位数</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, idx) in paginatedRows" :key="r.part_number">
          <td>{{ (currentPage - 1) * PAGE_SIZE + idx + 1 }}</td>
          <td>
            <a class="part-link" href="#" @click.prevent="goToInventory(r.part_number)">
              {{ r.part_number }}
            </a>
          </td>
          <td>{{ r.part_name || '' }}</td>
          <td><span class="qty-badge">{{ r.total }}</span></td>
          <td>{{ r.locationCount }}</td>
        </tr>
        <tr v-if="!filteredRows.length">
          <td colspan="5" style="text-align:center;color:#999;">暂无库存数据</td>
        </tr>
      </tbody>
    </table>
    <Pagination v-model:page="currentPage" :total="filteredRows.length" />
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
import { listDocs } from '../api/db.js';
import { exportCSV } from '../api/csv.js';
import { Query } from 'appwrite';

const router = useRouter();
const summaryRows = ref([]);
const keyword = ref('');

/* ⭐ 操作菜单 */
const menuItems = computed(() => [
  { label: '刷新', onClick: load },
  { label: '导出汇总CSV', onClick: handleExport }
]);

const filteredRows = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return summaryRows.value;
  return summaryRows.value.filter(r =>
    r.part_number.toLowerCase().includes(kw) ||
    r.part_name.toLowerCase().includes(kw)
  );
});
const { currentPage, paginatedItems: paginatedRows } = usePagination(filteredRows);

async function load() {
  const res = await listDocs(CONFIG.TABLES.inventory, [Query.limit(5000)]);
  const map = {};
  res.documents.forEach(d => {
    const key = d.part_number || ''; if (!key) return;
    if (!map[key]) map[key] = { part_name: d.part_name || '', total: 0, locations: new Set() };
    map[key].total += Number(d.quantity) || 0;
    if (d.location) map[key].locations.add(d.location);
  });
  summaryRows.value = Object.entries(map)
    .map(([part_number, v]) => ({
      part_number,
      part_name: v.part_name,
      total: v.total,
      locationCount: v.locations.size
    }))
    .sort((a, b) => a.part_number.localeCompare(b.part_number));
}
onMounted(load);

function goToInventory(part) {
  router.push({ name: 'inventory', query: { part } });
}

function handleExport() {
  if (!summaryRows.value.length) { alert('暂无数据'); return; }
  const headers = ['part_number', 'part_name', 'total_quantity', 'location_count'];
  const rows = summaryRows.value.map(r =>
    [r.part_number, r.part_name, r.total, r.locationCount]
  );
  exportCSV(headers, rows, 'inventory_summary');
}
</script>
