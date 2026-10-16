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
import { Query } from 'appwrite';

const router = useRouter();
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
      // 汇总需要按料号聚合，Appwrite 无 group by，这里分页拉库存明细后前端聚合当前页
      // 若数据量大，建议后端建 summary 表
      const queries = [
        Query.orderAsc('part_number'),
        Query.limit(pageSize),
        Query.offset((page - 1) * pageSize),
      ];
      const kw = keyword.value.trim();
      if (kw) {
        queries.unshift(Query.search('part_number', kw));
      }
      const res = await listDocs(CONFIG.TABLES.inventory, queries);

      // 对当前页按料号聚合
      const map = {};
      res.documents.forEach(d => {
        const key = d.part_number || ''; if (!key) return;
        if (!map[key]) map[key] = { part_name: d.part_name || '', total: 0, locations: new Set() };
        map[key].total += Number(d.quantity) || 0;
        if (d.location) map[key].locations.add(d.location);
      });
      const items = Object.entries(map).map(([part_number, v]) => ({
        part_number,
        part_name: v.part_name,
        total: v.total,
        locationCount: v.locations.size
      }));
      return { items, total: res.total };
    },
  });

watch(keyword, () => {
  if (currentPage.value !== 1) currentPage.value = 1;
  else reload();
});

onMounted(reload);

function goToInventory(part) {
  router.push({ name: 'inventory', query: { part } });
}

async function handleExport() {
  // 导出全量：分页拉取
  const all = [];
  const chunk = 500;
  let offset = 0;
  while (true) {
    const res = await listDocs(CONFIG.TABLES.inventory, [
      Query.limit(chunk), Query.offset(offset)
    ]);
    all.push(...res.documents);
    if (res.documents.length < chunk) break;
    offset += chunk;
  }
  if (!all.length) { alert('暂无数据'); return; }
  const map = {};
  all.forEach(d => {
    const key = d.part_number || ''; if (!key) return;
    if (!map[key]) map[key] = { part_name: d.part_name || '', total: 0, locations: new Set() };
    map[key].total += Number(d.quantity) || 0;
    if (d.location) map[key].locations.add(d.location);
  });
  const headers = ['part_number', 'part_name', 'total_quantity', 'location_count'];
  const rows = Object.entries(map).map(([pn, v]) =>
    [pn, v.part_name, v.total, v.locations.size]
  );
  exportCSV(headers, rows, 'inventory_summary');
}
</script>
