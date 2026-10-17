<template>
  <MainLayout>
    <div class="page-header">
      <div class="search-bar" style="display: flex; gap: 8px; align-items: center; flex: 1; max-width: 600px;">
        <input 
          v-model="searchInput" 
          type="text" 
          placeholder="按物料料号搜索..." 
          @keyup.enter="handleSearch"
          style="flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; outline: none;"
        >
        <button @click="handleSearch" style="padding: 8px 16px; background: #2563eb; color: white; border: 1px solid #2563eb; border-radius: 6px; cursor: pointer; font-size: 14px; white-space: nowrap;">查询</button>
        <button v-if="keyword" @click="clearSearch" style="padding: 8px 16px; background: #ffffff; color: #333; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 14px; white-space: nowrap;">重置</button>
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
          <td>{{ partName(r.part_number) }}</td>
          <td><span class="qty-badge">{{ r.total }}</span></td>
          <td>{{ r.locationCount }}</td>
        </tr>
        <tr v-if="!loading && !paginatedRows.length">
          <td colspan="5" style="text-align:center;color:#999;">暂无库存数据</td>
        </tr>
      </tbody>
    </table>
    <Pagination v-model:page="currentPage" :total="total" :loading="loading" />
  </MainLayout>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import ActionMenu from '../components/ActionMenu.vue';
import Pagination from '../components/Pagination.vue';
import { PAGE_SIZE, usePagination } from '../composables/usePagination.js';
import { CONFIG } from '../config.js';
import { listDocs } from '../api/db.js';
import { exportCSV } from '../api/csv.js';
import { partName, loadPartNamesForPage } from '../api/partMap.js';
import { Query } from 'appwrite';

const router = useRouter();
const searchInput = ref('');
const keyword = ref('');

const menuItems = computed(() => [
  { label: '刷新', onClick: () => reload() },
  { label: '导出汇总CSV', onClick: handleExport }
]);

const { currentPage, paginatedItems: paginatedRows, total, loading, reload } =
  usePagination([], {
    mode: 'server',
    pageSize: PAGE_SIZE,
    fetcher: async ({ page, pageSize }) => {
      const queries = [
        Query.orderAsc('part_number'),
        Query.limit(pageSize),
        Query.offset((page - 1) * pageSize),
      ];
      
      // ⭐ 将可能引发报错的 search 改为安全的 startsWith
      if (keyword.value) {
        queries.push(Query.startsWith('part_number', keyword.value));
      }
      
      const res = await listDocs(CONFIG.TABLES.inventory, queries);
      await loadPartNamesForPage(res.documents);

      const map = {};
      res.documents.forEach(d => {
        const key = d.part_number || ''; if (!key) return;
        if (!map[key]) map[key] = { total: 0, locations: new Set() };
        map[key].total += Number(d.quantity) || 0;
        if (d.location) map[key].locations.add(d.location);
      });
      const items = Object.entries(map).map(([part_number, v]) => ({
        part_number, total: v.total, locationCount: v.locations.size
      }));
      
      return { items, total: res.total };
    },
  });

function handleSearch() {
  keyword.value = searchInput.value.trim();
  if (currentPage.value !== 1) currentPage.value = 1;
  else reload();
}

function clearSearch() { searchInput.value = ''; handleSearch(); }

onMounted(reload);

function goToInventory(part) {
  router.push({ name: 'inventory', query: { part } });
}

async function handleExport() {
  // 导出全量数据
  const all = [];
  let offset = 0;
  const chunk = 500;
  while (true) {
    const res = await listDocs(CONFIG.TABLES.inventory, [Query.limit(chunk), Query.offset(offset)]);
    all.push(...res.documents);
    if (res.documents.length < chunk) break;
    offset += chunk;
  }
  if (!all.length) { alert('暂无数据'); return; }
  await loadPartNamesForPage(all);
  const map = {};
  all.forEach(d => {
    const key = d.part_number || ''; if (!key) return;
    if (!map[key]) map[key] = { total: 0, locations: new Set() };
    map[key].total += Number(d.quantity) || 0;
    if (d.location) map[key].locations.add(d.location);
  });
  const headers = ['part_number', 'part_name', 'total_quantity', 'location_count'];
  const rows = Object.entries(map).map(([pn, v]) => [pn, partName(pn), v.total, v.locations.size]);
  exportCSV(headers, rows, 'inventory_summary');
}
</script>