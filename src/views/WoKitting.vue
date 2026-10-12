<template>
  <MainLayout>
    <div class="toolbar">
      <button @click="$router.push('/wo')">← 返回工单列表</button>
      <button @click="load" style="margin-left:8px;">刷新</button>
      <button @click="handleExport" style="margin-left:8px;">导出CSV</button>
    </div>

    <!-- 工单信息卡片 -->
    <div class="card" v-if="wo">
      <h2>
        工单 {{ wo.wo_number }}
        <small style="color:#999;font-size:14px;font-weight:normal;">
          {{ wo.product_name }} ({{ wo.product_number }})
        </small>
      </h2>
      <div class="wo-meta">
        <span>计划数量：<b>{{ wo.plan_qty ?? '-' }}</b></span>
        <span>生产日期：<b>{{ wo.produce_date || '-' }}</b></span>
        <span>状态：<b>{{ statusText(wo.status) }}</b></span>
        <span>BOM版本：<b>{{ bomVersion || '-' }}</b></span>
        <span>物料种类：<b>{{ rows.length }}</b></span>
        <span>缺料种类：
          <b :style="{ color: missingCount > 0 ? '#d33' : '#16a34a' }">
            {{ missingCount }}
          </b>
        </span>
      </div>
    </div>

    <!-- 齐套明细表 -->
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
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, idx) in rows" :key="r.part_number">
          <td>{{ idx + 1 }}</td>
          <td>{{ r.part_number }}</td>
          <td>{{ r.part_name || '' }}</td>
          <td>{{ r.qty_per_board }}</td>
          <td>{{ r.required }}</td>
          <td>{{ r.issued }}</td>
          <td :style="{ color: r.excess < 0 ? '#d33' : '#16a34a', fontWeight: 600 }">
            {{ r.excess > 0 ? '+' : '' }}{{ r.excess }}
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="7" style="text-align:center;color:#999;">
            {{ loading ? '加载中...' : '该工单 BOM 没有明细' }}
          </td>
        </tr>
      </tbody>
    </table>
  </MainLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import { CONFIG } from '../config.js';
import { listDocs, getDoc } from '../api/db.js';
import { exportCSV } from '../api/csv.js';
import { Query } from 'appwrite';

const props = defineProps({ woId: String });
const route = useRoute();
const woId = computed(() => props.woId || route.params.woId);

const wo = ref(null);
const bomVersion = ref('');
const rows = ref([]);
const loading = ref(false);

const missingCount = computed(() => rows.value.filter(r => r.excess < 0).length);

function statusText(s) {
  return s === 'completed' ? '已完成' : s === 'in_progress' ? '生产中' : '待生产';
}

async function load() {
  loading.value = true;
  try {
    // 1. 工单
    wo.value = await getDoc(CONFIG.TABLES.wo, woId.value);
    if (!wo.value?.bom_id) {
      alert('该工单未关联 BOM，无法做齐套分析。');
      rows.value = [];
      return;
    }

    // 2. BOM 头（取版本号）
    const bom = await getDoc(CONFIG.TABLES.bom, wo.value.bom_id);
    bomVersion.value = bom?.version || '';

    // 3. BOM 明细
    const bomItemRes = await listDocs(CONFIG.TABLES.bomItem, [
      Query.equal('bom_id', wo.value.bom_id),
      Query.orderAsc('part_number'),
      Query.limit(20000)
    ]);

    // 4. 该工单所有领料记录
    const issueRes = await listDocs(CONFIG.TABLES.issue, [
      Query.equal('wo_number', wo.value.wo_number),
      Query.limit(20000)
    ]);

    // 5. 汇总领料：part_number -> 发料数量
    const issueMap = {};
    issueRes.documents.forEach(d => {
      const pn = d.part_number; if (!pn) return;
      issueMap[pn] = (issueMap[pn] || 0) + (Number(d.issue_qty) || 0);
    });

    // 6. 计算每一行
    const planQty = Number(wo.value.plan_qty) || 0;
    rows.value = bomItemRes.documents.map(it => {
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
        excess
      };
    }).sort((a, b) => (a.part_number || '').localeCompare(b.part_number || ''));
  } catch (e) {
    alert('加载失败：' + e.message);
  } finally {
    loading.value = false;
  }
}

watch(woId, load);

onMounted(() => {
  if (!woId.value) { alert('未指定工单'); return; }
  load();
});

function handleExport() {
  if (!rows.value.length) { alert('暂无数据'); return; }
  const headers = ['part_number', 'part_name', 'qty_per_board', 'required', 'issued', 'excess'];
  const data = rows.value.map(r => [
    r.part_number, r.part_name, r.qty_per_board, r.required, r.issued, r.excess
  ]);
  exportCSV(headers, data, `kitting_${wo.value?.wo_number || woId.value}`);
}
</script>
