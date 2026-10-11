<template>
  <MainLayout>
    <div class="toolbar">
      <button @click="$router.push('/finish')">← 返回列表</button>
    </div>

    <div class="card" v-if="wo">
      <h2>工单 {{ wo.wo_number }}</h2>
      <div class="wo-meta">
        <span>成品料号：<b>{{ wo.product_number || '-' }}</b></span>
        <span>产品名称：<b>{{ wo.product_name || '-' }}</b></span>
        <span>计划数量：<b>{{ wo.plan_qty ?? '-' }}</b></span>
        <span>生产日期：<b>{{ wo.produce_date || '-' }}</b></span>
        <span>状态：<b>{{ statusText(wo.status) }}</b></span>
      </div>

      <div style="margin-top:16px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;color:#555;margin-bottom:6px;">
          <span>已入库：<b style="color:#2563eb;">{{ finishedQty }}</b></span>
          <span>未入库：<b style="color:#d33;">{{ remainQty }}</b></span>
          <span>进度：<b>{{ percent }}%</b></span>
        </div>
        <div style="height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden;">
          <div :style="{
            width: percent + '%',
            height: '100%',
            background: percent >= 100 ? '#16a34a' : '#2563eb',
            transition: 'width .3s'
          }"></div>
        </div>
      </div>
    </div>

    <div class="toolbar" style="margin-top:24px;">
      <h3 style="flex:1;">入库记录</h3>
      <button @click="openAdd">新增入库单</button>
      <button @click="handleExport">导出CSV</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>成品料号</th><th>入库数量</th><th>入库人</th><th>入库时间</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in finishes" :key="d.$id">
          <td>{{ d.product_number || '' }}</td>
          <td><b>{{ d.finish_qty ?? '' }}</b></td>
          <td>{{ d.operator || '' }}</td>
          <td>{{ formatTime(d.finished_at) }}</td>
          <td><button @click="deleteRow(d.$id)">删除</button></td>
        </tr>
        <tr v-if="!finishes.length">
          <td colspan="5" style="text-align:center;color:#999;">暂无入库记录</td>
        </tr>
      </tbody>
    </table>

    <!-- 新增弹窗 -->
    <div v-if="showAdd" class="modal-mask">
      <div class="modal-box">
        <h3>新增入库单</h3>
        <label>成品料号
          <input :value="wo?.product_number" type="text" readonly
                 style="background:#f3f4f6;cursor:not-allowed;">
        </label>
        <label>入库数量（最多 {{ maxQty }}）
          <input v-model.number="addForm.qty" type="number" placeholder="输入入库数量">
        </label>
        <label>入库人
          <input v-model="addForm.operator" type="text" placeholder="入库人">
        </label>
        <p class="error">{{ addError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showAdd = false">取消</button>
          <button class="btn-save" @click="saveAdd">保存</button>
        </div>
      </div>
    </div>
  </MainLayout>
</template>

<script setup>
import { ref, onMounted, computed, watch, reactive } from 'vue';
import { useRoute } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import { CONFIG } from '../config.js';
import { listDocs, getDoc, createDoc, updateDoc, deleteDoc } from '../api/db.js';
import { exportCSV } from '../api/csv.js';
import { Query } from 'appwrite';

const props = defineProps({ wo: String });
const route = useRoute();
const woNumber = computed(() => props.wo || route.params.wo);

const wo = ref(null);
const finishes = ref([]);
const showAdd = ref(false);
const addError = ref('');
const addForm = reactive({ qty: '', operator: '' });

function statusText(s) {
  return s === 'completed' ? '已完成' : s === 'in_progress' ? '生产中' : '待生产';
}
function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch { return iso; }
}

const planQty = computed(() => Number(wo.value?.plan_qty) || 0);
const finishedQty = computed(() =>
  finishes.value.reduce((s, d) => s + (Number(d.finish_qty) || 0), 0)
);
const remainQty = computed(() => Math.max(planQty.value - finishedQty.value, 0));
const percent = computed(() =>
  planQty.value > 0 ? Math.min(Math.round(finishedQty.value / planQty.value * 100), 100) : 0
);
const maxQty = computed(() => remainQty.value);

async function loadWo() {
  const res = await listDocs(CONFIG.TABLES.wo, [
    Query.equal('wo_number', woNumber.value), Query.limit(1)
  ]);
  if (!res.documents.length) { alert('未找到该工单'); return; }
  wo.value = res.documents[0];
}
async function loadFinishes() {
  const res = await listDocs(CONFIG.TABLES.finish, [
    Query.equal('wo_number', woNumber.value),
    Query.orderDesc('finished_at'),
    Query.limit(5000)
  ]);
  finishes.value = res.documents;
}
async function loadAll() { await loadWo(); await loadFinishes(); }
watch(woNumber, loadAll);

onMounted(() => {
  if (!woNumber.value) { alert('未指定工单号'); return; }
  loadAll();
});

function openAdd() {
  if (remainQty.value <= 0) {
    alert('该工单已全部入库完成，无需再入库。');
    return;
  }
  addForm.qty = '';
  addForm.operator = '';
  addError.value = '';
  showAdd.value = true;
}

async function saveAdd() {
  const qty = Number(addForm.qty);
  if (!qty || qty <= 0) { addError.value = '请输入有效的入库数量'; return; }
  if (qty > remainQty.value) {
    addError.value = `入库数量不能超过未入库数量（${remainQty.value}）`;
    return;
  }
  try {
    await createDoc(CONFIG.TABLES.finish, {
      wo_number: woNumber.value,
      product_number: wo.value.product_number || '',
      finish_qty: qty,
      operator: addForm.operator.trim(),
      finished_at: new Date().toISOString()
    });

    const newTotal = finishedQty.value + qty;
    if (newTotal >= planQty.value && wo.value.status !== 'completed') {
      await updateDoc(CONFIG.TABLES.wo, wo.value.$id, { status: 'completed' });
      wo.value.status = 'completed';
    }

    showAdd.value = false;
    await loadFinishes();
  } catch (e) {
    addError.value = '保存失败：' + (e.message || e);
  }
}

async function deleteRow(docId) {
  if (!confirm('确认删除该入库记录？删除后工单状态可能需要手动调整。')) return;
  try {
    await deleteDoc(CONFIG.TABLES.finish, docId);
    // 重新拉取工单
    const freshWo = await getDoc(CONFIG.TABLES.wo, wo.value.$id);
    wo.value = freshWo;

    const res = await listDocs(CONFIG.TABLES.finish, [
      Query.equal('wo_number', woNumber.value), Query.limit(5000)
    ]);
    const total = res.documents.reduce((s, d) => s + (Number(d.finish_qty) || 0), 0);
    if (wo.value.status === 'completed' && total < planQty.value) {
      await updateDoc(CONFIG.TABLES.wo, wo.value.$id, { status: 'in_progress' });
      wo.value.status = 'in_progress';
    }
    await loadFinishes();
  } catch (e) {
    alert('删除失败：' + e.message);
  }
}

function handleExport() {
  const headers = ['wo_number', 'product_number', 'finish_qty', 'operator', 'finished_at'];
  const rows = finishes.value.map(d => headers.map(h => d[h] ?? ''));
  exportCSV(headers, rows, `finish_${woNumber.value}`);
}
</script>
