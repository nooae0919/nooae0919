<template>
  <MainLayout>
    <div class="page-header">
      <div class="page-title">齐套详情</div>
      <ActionMenu :items="menuItems" />
    </div>

    <div class="card" v-if="wo">
      <h2>工单 {{ wo.wo_number }} <small style="color:#999;font-size:14px;font-weight:normal;">{{ wo.product_name }} ({{ wo.product_number }})</small></h2>
      <div class="wo-meta">
        <span>线体：<b>{{ wo.line || '-' }}</b></span>
        <span>计划数量：<b>{{ wo.plan_qty ?? '-' }}</b></span>
        <span>生产日期：<b>{{ wo.produce_date || '-' }}</b></span>
        <span>状态：<b>{{ statusText(wo.status) }}</b></span>
        <span>BOM快照版本：<b>{{ bomVersion || '-' }}</b></span>
        <span>物料种类：<b>{{ total }}</b></span>
        <span>超发种类：<b style="color:#16a34a;">{{ excessCount }}</b></span>
        <span>缺料种类：<b style="color:#d33;">{{ missingCount }}</b></span>
      </div>
    </div>

    <div class="toolbar" style="margin-top:24px;"><h3 style="flex:1;">齐套明细</h3></div>
    <table>
      <thead>
        <tr>
          <th style="width:60px;">序号</th><th>物料料号</th><th>物料名称</th><th style="width:100px;">基本用量</th>
          <th style="width:120px;">需求数量</th><th style="width:120px;">发料数量</th><th style="width:120px;">超发数量</th><th style="width:100px;">入库状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, idx) in paginatedRows" :key="r.part_number">
          <td>{{ (currentPage - 1) * PAGE_SIZE + idx + 1 }}</td>
          <td>{{ r.part_number }}</td>
          <td>{{ partName(r.part_number) }}</td>
          <td>{{ r.qty_per_board }}</td>
          <td>{{ r.required }}</td>
          <td>{{ r.issued }}</td>
          <td :style="{ color: r.excess < 0 ? '#d33' : (r.excess > 0 ? '#16a34a' : '#666'), fontWeight: 600 }">{{ r.excess > 0 ? '+' : '' }}{{ r.excess }}</td>
          <td>
            <span v-if="r.excess > 0 && r.pushed" style="color:#16a34a;font-size:13px;">已入库</span>
            <span v-else-if="r.excess > 0" style="color:#2563eb;font-size:13px;">待入库</span>
            <span v-else style="color:#ccc;">-</span>
          </td>
        </tr>
        <tr v-if="!loading && !paginatedRows.length"><td colspan="8" style="text-align:center;color:#999;">该工单 BOM 没有明细</td></tr>
      </tbody>
    </table>
    <Pagination v-model:page="currentPage" :total="total" :loading="loading" />
  </MainLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import ActionMenu from '../components/ActionMenu.vue';
import Pagination from '../components/Pagination.vue';
import { PAGE_SIZE, usePagination } from '../composables/usePagination.js';
import { CONFIG } from '../config.js';
import { listDocs, getDoc } from '../api/db.js';
import { exportCSV } from '../api/csv.js';
import { syncExcessToInventory } from '../api/kitting.js';
import { partName, loadPartNamesForPage } from '../api/partMap.js';
import { Query } from 'appwrite';

const props = defineProps({ woId: String });
const route = useRoute();
const router = useRouter();
const woId = computed(() => props.woId || route.params.woId);

const wo = ref(null);
const bomVersion = ref('');
const excessCount = ref(0);
const missingCount = ref(0);
const allRows = ref([]);
const pushedMap = ref({});

const menuItems = computed(() => [
  { label: '返回工单列表', onClick: () => router.push('/wo') },
  { label: '刷新', onClick: load },
  { label: '超发入库', onClick: pushExcessToInventory, disabled: excessCount.value === 0 },
  { label: '导出CSV', onClick: handleExport, disabled: !total.value }
]);

function statusText(s) { return s === 'completed' ? '已完成' : s === 'in_progress' ? '生产中' : '待生产'; }

const { currentPage, paginatedItems: paginatedRows, total, loading, reload } =
  usePagination([], {
    mode: 'server',
    pageSize: PAGE_SIZE,
    fetcher: async ({ page, pageSize }) => {
      if (!wo.value) await loadAllRows();
      const start = (page - 1) * pageSize;
      const pageRows = allRows.value.slice(start, start + pageSize);
      await loadPartNamesForPage(pageRows); // 按当前页加载名称
      return { items: pageRows, total: allRows.value.length };
    },
  });

async function loadAllRows() {
  wo.value = await getDoc(CONFIG.TABLES.wo, woId.value);
  if (!wo.value) { alert('未找到工单'); allRows.value = []; return; }

  const snapRes = await listDocs(CONFIG.TABLES.woBom, [Query.equal('wo_number', wo.value.wo_number), Query.orderAsc('part_number'), Query.limit(20000)]);
  if (!snapRes.documents.length) { alert('无快照，请重载BOM'); allRows.value = []; return; }
  bomVersion.value = snapRes.documents[0]?.bom_version || '';

  const issueRes = await listDocs(CONFIG.TABLES.issue, [Query.equal('wo_number', wo.value.wo_number), Query.limit(20000)]);
  const issueMap = {};
  issueRes.documents.forEach(d => { const pn = d.part_number; if (pn) issueMap[pn] = (issueMap[pn] || 0) + (Number(d.issue_qty) || 0); });

  const invRes = await listDocs(CONFIG.TABLES.inventory, [Query.equal('source_wo', wo.value.wo_number), Query.limit(5000)]);
  pushedMap.value = {};
  invRes.documents.forEach(d => { pushedMap.value[d.part_number] = true; });

  const planQty = Number(wo.value.plan_qty) || 0;
  allRows.value = snapRes.documents.map(it => {
    const per = Number(it.qty_per_board) || 0;
    const required = Math.ceil(per * planQty);
    const issued = issueMap[it.part_number] || 0;
    return { part_number: it.part_number, qty_per_board: per, required, issued, excess: issued - required, pushed: !!pushedMap.value[it.part_number] };
  }).sort((a, b) => (a.part_number || '').localeCompare(b.part_number || ''));

  excessCount.value = allRows.value.filter(r => r.excess > 0).length;
  missingCount.value = allRows.value.filter(r => r.excess < 0).length;
}

async function load() { allRows.value = []; wo.value = null; await loadAllRows(); await reload(); }
watch(woId, load);
onMounted(() => { if (woId.value) load(); });

async function pushExcessToInventory() {
  if (!wo.value || !wo.value.line) { alert('该工单没有线体'); return; }
  const excessRows = allRows.value.filter(r => r.excess > 0);
  if (!excessRows.length) return;
  if (!confirm(`将把 ${excessRows.length} 种超发物料入库到「${wo.value.line}」，确认？`)) return;
  const res = await syncExcessToInventory(wo.value.wo_number);
  await load();
  alert(`超发入库完成：新增 ${res.created}，更新 ${res.updated}，删除 ${res.removed}`);
}

async function handleExport() {
  if (!allRows.value.length) { alert('暂无数据'); return; }
  await loadPartNamesForPage(allRows.value);
  const headers = ['part_number', 'part_name', 'qty_per_board', 'required', 'issued', 'excess'];
  const data = allRows.value.map(r => [r.part_number, partName(r.part_number), r.qty_per_board, r.required, r.issued, r.excess]);
  exportCSV(headers, data, `kitting_${wo.value?.wo_number || woId.value}`);
}
</script>
