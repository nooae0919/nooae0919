<template>
  <MainLayout>
    <div class="page-header">
      <div class="page-title">齐套详情</div>
      <ActionMenu :items="menuItems" />
    </div>

    <div class="card" v-if="wo">
      <h2>
        工单 {{ wo.wo_number }}
        <small style="color:#999;font-size:14px;font-weight:normal;">
          {{ wo.product_name }} ({{ wo.product_number }})
        </small>
      </h2>
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

    <div class="toolbar" style="margin-top:24px;">
      <h3 style="flex:1;">齐套明细</h3>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:60px;">序号</th>
          <th>物料料号</th>
          <th>物料名称</th>
          <th style="width:100px;">基本用量</th>
          <th style="width:120px;">需求数量</th>
          <th style="width:120px;">发料数量</th>
          <th style="width:120px;">超发数量</th>
          <th style="width:100px;">入库状态</th>
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
          <td :style="{ color: r.excess < 0 ? '#d33' : (r.excess > 0 ? '#16a34a' : '#666'), fontWeight: 600 }">
            {{ r.excess > 0 ? '+' : '' }}{{ r.excess }}
          </td>
          <td>
            <span v-if="r.excess > 0 && r.pushed" style="color:#16a34a;font-size:13px;">已入库</span>
            <span v-else-if="r.excess > 0" style="color:#2563eb;font-size:13px;">待入库</span>
            <span v-else style="color:#ccc;">-</span>
          </td>
        </tr>
        <tr v-if="!loading && !paginatedRows.length">
          <td colspan="8" style="text-align:center;color:#999;">
            {{ loading ? '加载中...' : '该工单 BOM 没有明细' }}
          </td>
        </tr>
      </tbody>
    </table>
    <Pagination v-model:page="currentPage" :total="total" :loading="loading" />
  </MainLayout>
</template>

<script setup>
import { partName, getPartMap } from '../api/partMap.js';
// onMounted 里 load() 之前先 await getPartMap();
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
import { Query } from 'appwrite';

const props = defineProps({ woId: String });
const route = useRoute();
const router = useRouter();
const woId = computed(() => props.woId || route.params.woId);

const wo = ref(null);
const bomVersion = ref('');
const excessCount = ref(0);
const missingCount = ref(0);
const allRows = ref([]);       // 全量（用于导出、超发统计、入库）
const pushedMap = ref({});

const menuItems = computed(() => [
  { label: '返回工单列表', onClick: () => router.push('/wo') },
  { label: '刷新', onClick: load },
  { label: '超发入库', onClick: pushExcessToInventory, disabled: excessCount.value === 0 },
  { label: '导出CSV', onClick: handleExport, disabled: !total.value }
]);

function statusText(s) {
  return s === 'completed' ? '已完成' : s === 'in_progress' ? '生产中' : '待生产';
}

const { currentPage, paginatedItems: paginatedRows, total, loading, reload } =
  usePagination([], {
    mode: 'server',
    pageSize: PAGE_SIZE,
    fetcher: async ({ page, pageSize }) => {
      // 齐套数据需要 join：wo_bom 快照 + issue 领料
      // 服务端分页单位是 wo_bom 快照行
      if (!wo.value) {
        // 第一次先加载头部与全量用于统计
        await loadAllRows();
      }
      const start = (page - 1) * pageSize;
      const pageRows = allRows.value.slice(start, start + pageSize);
      return { items: pageRows, total: allRows.value.length };
    },
  });

async function loadPushedMap() {
  if (!wo.value) return {};
  const res = await listDocs(CONFIG.TABLES.inventory, [
    Query.equal('source_wo', wo.value.wo_number),
    Query.limit(5000)
  ]);
  const map = {};
  res.documents.forEach(d => { map[d.part_number] = true; });
  return map;
}

async function loadAllRows() {
  wo.value = await getDoc(CONFIG.TABLES.wo, woId.value);
  if (!wo.value) { alert('未找到工单'); allRows.value = []; return; }

  // 快照
  const snapRes = await listDocs(CONFIG.TABLES.woBom, [
    Query.equal('wo_number', wo.value.wo_number),
    Query.orderAsc('part_number'),
    Query.limit(20000)
  ]);
  if (!snapRes.documents.length) {
    alert('该工单还没有用料快照，请在工单列表点"重载BOM"生成。');
    allRows.value = [];
    return;
  }
  bomVersion.value = snapRes.documents[0]?.bom_version || '';

  // 领料
  const issueRes = await listDocs(CONFIG.TABLES.issue, [
    Query.equal('wo_number', wo.value.wo_number),
    Query.limit(20000)
  ]);
  const issueMap = {};
  issueRes.documents.forEach(d => {
    const pn = d.part_number; if (!pn) return;
    issueMap[pn] = (issueMap[pn] || 0) + (Number(d.issue_qty) || 0);
  });

  pushedMap.value = await loadPushedMap();

  const planQty = Number(wo.value.plan_qty) || 0;
  allRows.value = snapRes.documents.map(it => {
    const per = Number(it.qty_per_board) || 0;
    const required = Math.ceil(per * planQty);
    const issued = issueMap[it.part_number] || 0;
    const excess = issued - required;
    return {
      part_number: it.part_number,
      part_name: it.part_name || '',
      qty_per_board: per,
      required,
      issued,
      excess,
      pushed: !!pushedMap.value[it.part_number]
    };
  }).sort((a, b) => (a.part_number || '').localeCompare(b.part_number || ''));

  excessCount.value = allRows.value.filter(r => r.excess > 0).length;
  missingCount.value = allRows.value.filter(r => r.excess < 0).length;
}

async function load() {
  allRows.value = [];
  wo.value = null;
  await loadAllRows();
  await reload();
}

watch(woId, load);

onMounted(() => {
  if (!woId.value) { alert('未指定工单'); return; }
  load();
});

async function pushExcessToInventory() {
  if (!wo.value) return;
  if (!wo.value.line) {
    alert('该工单没有线体，无法确定入库库位。请先编辑工单选择线体。');
    return;
  }
  const excessRows = allRows.value.filter(r => r.excess > 0);
  if (!excessRows.length) {
    alert('该工单没有超发的物料，无需入库。');
    return;
  }
  const ok = window.$confirm
    ? await window.$confirm({
        title: '超发入库确认',
        message: `将把 ${excessRows.length} 种超发物料入库到库位「${wo.value.line}」。\n已存在同来源记录的会先删除再写入，确认继续？`
      })
    : confirm(`将把 ${excessRows.length} 种超发物料入库到库位「${wo.value.line}」，确认继续？`);
  if (!ok) return;

  const res = await syncExcessToInventory(wo.value.wo_number);
  await load();

  let msg = `超发入库完成：`;
  if (res.action === 'sync') {
    msg += `新增 ${res.created} 条，更新 ${res.updated} 条，删除 ${res.removed} 条。`;
  } else if (res.action === 'clear') {
    msg += `已清除 ${res.removed} 条记录。`;
  } else {
    msg += `未执行（${res.reason || '未知原因'}）`;
  }
  alert(msg);
}

function handleExport() {
  if (!allRows.value.length) { alert('暂无数据'); return; }
  const headers = ['part_number', 'part_name', 'qty_per_board', 'required', 'issued', 'excess'];
  const data = allRows.value.map(r => [
    r.part_number, r.part_name, r.qty_per_board, r.required, r.issued, r.excess
  ]);
  exportCSV(headers, data, `kitting_${wo.value?.wo_number || woId.value}`);
}
</script>
