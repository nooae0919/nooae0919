<template>
  <MainLayout>
    <div class="toolbar">
      <button @click="$router.push('/issue')">← 返回列表</button>
    </div>

    <!-- 工单信息卡片 -->
    <div class="card" v-if="wo">
      <h2>工单 {{ wo.wo_number }}</h2>
      <div class="wo-meta">
        <span>成品料号：<b>{{ wo.product_number || '-' }}</b></span>
        <span>产品名称：<b>{{ wo.product_name || '-' }}</b></span>
        <span>计划数量：<b>{{ wo.plan_qty ?? '-' }}</b></span>
        <span>生产日期：<b>{{ wo.produce_date || '-' }}</b></span>
        <span>状态：<b>{{ statusText(wo.status) }}</b></span>
      </div>
    </div>

    <!-- 领料记录（按领料单聚合） -->
    <div class="toolbar" style="margin-top:24px;">
      <h3 style="flex:1;">领料记录（{{ batches.length }} 张领料单）</h3>
      <button @click="triggerImport">导入CSV</button>
      <button @click="handleExport">导出CSV</button>
      <input type="file" accept=".csv" hidden ref="fileInput" @change="handleImport">
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:60px;">序号</th>
          <th>领料单号</th>
          <th>领料人</th>
          <th>领料时间</th>
          <th>物料种类</th>
          <th>领料总数</th>
          <th style="width:220px;">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(b, idx) in batches" :key="b.key">
          <td>{{ idx + 1 }}</td>
          <td>
            <a class="part-link" href="#" @click.prevent="openBatch(b)">
              {{ b.issue_no || '(无单号)' }}
            </a>
          </td>
          <td>{{ b.operator || '-' }}</td>
          <td>{{ b.issue_time || '-' }}</td>
          <td>{{ b.items.length }} 种</td>
          <td><b>{{ b.totalQty }}</b></td>
          <td>
            <button @click="openBatch(b)">查看详情</button>
            <button @click="deleteBatch(b)">删除整单</button>
          </td>
        </tr>
        <tr v-if="!batches.length">
          <td colspan="7" style="text-align:center;color:#999;">暂无领料记录</td>
        </tr>
      </tbody>
    </table>

    <!-- 领料单详情弹窗 -->
    <div v-if="showBatch" class="modal-mask">
      <div class="modal-box" style="width:680px;max-width:92vw;">
        <h3>领料单详情</h3>
        <div style="font-size:13px;color:#555;margin-bottom:12px;line-height:1.8;">
          领料单号：<b>{{ currentBatch?.issue_no || '(无)' }}</b><br>
          领料人：<b>{{ currentBatch?.operator || '-' }}</b>　
          时间：<b>{{ currentBatch?.issue_time || '-' }}</b><br>
          共 <b>{{ currentBatch?.items.length }}</b> 种物料，合计 <b>{{ currentBatch?.totalQty }}</b>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:60px;">序号</th>
              <th>物料料号</th>
              <th>物料名称</th>
              <th>数量</th>
              <th style="width:100px;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, i) in currentBatch?.items || []" :key="it.$id">
              <td>{{ i + 1 }}</td>
              <td>{{ it.part_number || '' }}</td>
              <td>{{ it.part_name || '' }}</td>
              <td><b>{{ it.issue_qty ?? '' }}</b></td>
              <td><button @click="deleteItem(it.$id)">删除</button></td>
            </tr>
          </tbody>
        </table>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showBatch = false">关闭</button>
        </div>
      </div>
    </div>
  </MainLayout>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import { CONFIG } from '../config.js';
import { listDocs, createDoc, deleteDoc } from '../api/db.js';
import { exportCSV, readCSV } from '../api/csv.js';
import { Query } from 'appwrite';

const props = defineProps({ wo: String });
const route = useRoute();
const woNumber = computed(() => props.wo || route.params.wo);

const wo = ref(null);
const issues = ref([]);
const fileInput = ref(null);
const showBatch = ref(false);
const currentBatch = ref(null);

function statusText(s) {
  return s === 'completed' ? '已完成' : s === 'in_progress' ? '生产中' : '待生产';
}

/** 生成领料单号：IS + YYYYMMDDHHmmss + 3位随机 */
function genIssueNo() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `IS${date}${time}${rand}`;
}

/* ⭐ 核心：按 issue_no 聚合；没有 issue_no 的老数据按 三元组 兜底 */
const batches = computed(() => {
  const map = {};
  issues.value.forEach(d => {
    // 优先用 issue_no；没有就用 wo + operator + time 兜底
    const key = d.issue_no
      ? `NO:${d.issue_no}`
      : `FB:${d.wo_number}|${d.operator || ''}|${d.issue_time || ''}`;

    if (!map[key]) {
      map[key] = {
        key,
        issue_no: d.issue_no || '',
        wo_number: d.wo_number,
        operator: d.operator,
        issue_time: d.issue_time,
        items: [],
        totalQty: 0
      };
    }
    map[key].items.push(d);
    map[key].totalQty += Number(d.issue_qty) || 0;
  });

  // 按领料时间倒序；没时间的排后
  return Object.values(map).sort((a, b) =>
    (b.issue_time || '').localeCompare(a.issue_time || '')
  );
});

async function loadWo() {
  const res = await listDocs(CONFIG.TABLES.wo, [
    Query.equal('wo_number', woNumber.value), Query.limit(1)
  ]);
  if (!res.documents.length) { alert('未找到该工单'); return; }
  wo.value = res.documents[0];
}

async function loadIssues() {
  const res = await listDocs(CONFIG.TABLES.issue, [
    Query.equal('wo_number', woNumber.value),
    Query.orderDesc('issue_time'),
    Query.limit(5000)
  ]);
  issues.value = res.documents;
}

async function loadAll() { await loadWo(); await loadIssues(); }
watch(woNumber, loadAll);

onMounted(() => {
  if (!woNumber.value) { alert('未指定工单号'); return; }
  loadAll();
});

function openBatch(b) {
  currentBatch.value = b;
  showBatch.value = true;
}

/* 删除整张领料单 */
async function deleteBatch(b) {
  const ok = window.$confirm
    ? await window.$confirm({
        title: '删除确认',
        message: `确认删除该领料单？共 ${b.items.length} 条明细。`
      })
    : confirm(`确认删除该领料单？共 ${b.items.length} 条明细。`);
  if (!ok) return;

  try {
    for (const it of b.items) {
      await deleteDoc(CONFIG.TABLES.issue, it.$id);
    }
    await loadIssues();
    showBatch.value = false;
  } catch (e) {
    alert('删除失败：' + e.message);
  }
}

/* 删除单条明细 */
async function deleteItem(itemId) {
  const ok = window.$confirm
    ? await window.$confirm({ title: '删除确认', message: '确认删除该条领料明细？' })
    : confirm('确认删除该条领料明细？');
  if (!ok) return;

  try {
    await deleteDoc(CONFIG.TABLES.issue, itemId);
    await loadIssues();
    // 若当前批次已空，关闭弹窗
    if (currentBatch.value && currentBatch.value.items.length <= 1) {
      showBatch.value = false;
    } else if (currentBatch.value) {
      // 刷新当前批次数据
      const b = batches.value.find(x => x.key === currentBatch.value.key);
      currentBatch.value = b || null;
      if (!b) showBatch.value = false;
    }
  } catch (e) {
    alert('删除失败：' + e.message);
  }
}

function triggerImport() { fileInput.value.click(); }

/* ⭐ 导入：同 operator + issue_time 归为一个 issue_no */
async function handleImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);

  const hasIssueNo = headers.includes('issue_no');

  // 第 1 遍：先按 (operator, issue_time) 分组，给每组生成或复用 issue_no
  const groupNoMap = {};   // groupKey -> issue_no

  function groupKeyOf(data) {
    return `${data.operator || ''}|${data.issue_time || ''}`;
  }

  // 第 1 遍：确定每组的 issue_no
  for (const row of rows) {
    const data = {};
    headers.forEach((h, i) => {
      const v = row[i];
      if (v === undefined || v === null || v === '') return;
      data[h] = String(v).trim();
    });
    if (!data.part_number) continue;

    const gk = groupKeyOf(data);
    if (!groupNoMap[gk]) {
      // 如果 CSV 里有 issue_no，就用它；否则生成
      groupNoMap[gk] = (hasIssueNo && data.issue_no) ? data.issue_no : genIssueNo();
    }
  }

  // 第 2 遍：逐条写入
  let ok = 0, fail = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const data = {};
    headers.forEach((h, idx) => {
      const v = row[idx];
      if (v === undefined || v === null || v === '') return;
      if (h === 'issue_qty') {
        const n = Number(v); if (isNaN(n)) return;
        data[h] = n;
      } else {
        data[h] = String(v).trim();
      }
    });
    data.wo_number = woNumber.value;
    data.issue_no = groupNoMap[groupKeyOf(data)];   // 打上单号

    const qty = Number(data.issue_qty);
    if (!qty || qty < 1) {
      errors.push(`第 ${i+2} 行：领料数量 ${data.issue_qty} 不合法`);
      fail++;
      continue;
    }

    try {
      await createDoc(CONFIG.TABLES.issue, data);
      ok++;
    } catch (err) {
      errors.push(`第 ${i+2} 行：${err.message}`);
      fail++;
    }
  }

  let msg = `导入完成：成功 ${ok} 条，失败 ${fail} 条`;
  if (errors.length) {
    msg += '\n\n失败明细（前 10 条）：\n' + errors.slice(0, 10).join('\n');
    if (errors.length > 10) msg += `\n...还有 ${errors.length - 10} 条`;
  }
  alert(msg);

  await loadIssues();
  e.target.value = '';
}

/* 导出：带 issue_no */
function handleExport() {
  const headers = ['issue_no', 'wo_number', 'part_number', 'part_name', 'issue_qty', 'operator', 'issue_time'];
  const rows = issues.value.map(d => headers.map(h => d[h] ?? ''));
  exportCSV(headers, rows, `issue_${woNumber.value}`);
}
</script>
