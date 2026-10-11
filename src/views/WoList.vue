<template>
  <MainLayout>
    <div class="toolbar">
      <button @click="openAdd">新增工单</button>
      <button @click="triggerImport">导入CSV</button>
      <button @click="handleExport">导出CSV</button>
      <input type="file" accept=".csv" hidden ref="fileInput" @change="handleImport">
    </div>

    <table id="wo-table">
      <thead>
        <tr>
          <th>工单号</th>
          <th>成品料号</th>
          <th>产品名称</th>
          <th>计划数量</th>
          <th>生产日期</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in docs" :key="d.$id">
          <td>{{ d.wo_number || '' }}</td>
          <td>{{ d.product_number || '' }}</td>
          <td>{{ d.product_name || '' }}</td>
          <td>{{ d.plan_qty ?? '' }}</td>
          <td>{{ d.produce_date || '' }}</td>
          <td>{{ statusText(d.status) }}</td>
          <td>
            <span v-if="d.status === 'completed'" style="color:#999;font-size:13px;">
              已完成（不可修改）
            </span>
            <button v-else @click="openEdit(d.$id)">编辑</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- 新增弹窗 -->
    <div v-if="showAdd" class="modal-mask">
      <div class="modal-box">
        <h3>新增工单</h3>
        <label>工单号<input v-model="form.wo_number" type="text" placeholder="如 WO-2024-0001"></label>
        <label>成品料号<input v-model="form.product_number" type="text" placeholder="如 P-1001"></label>
        <label>产品名称<input v-model="form.product_name" type="text" placeholder="如 iPhone主板"></label>
        <label>计划数量<input v-model.number="form.plan_qty" type="number" placeholder="如 500"></label>
        <label>生产日期<input v-model="form.produce_date" type="date"></label>
        <label>状态
          <select v-model="form.status">
            <option value="pending">待生产</option>
            <option value="in_progress">生产中</option>
            <option value="completed">已完成</option>
          </select>
        </label>
        <p class="error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showAdd = false">取消</button>
          <button class="btn-save" @click="saveAdd">保存</button>
        </div>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <div v-if="showEdit" class="modal-mask">
      <div class="modal-box">
        <h3>编辑工单</h3>
        <label>工单号<input v-model="editForm.wo_number" type="text" disabled></label>
        <label>成品料号<input v-model="editForm.product_number" type="text"></label>
        <label>产品名称<input v-model="editForm.product_name" type="text"></label>
        <label>计划数量<input v-model.number="editForm.plan_qty" type="number"></label>
        <label>生产日期<input v-model="editForm.produce_date" type="date"></label>
        <label>状态
          <select v-model="editForm.status">
            <option value="pending">待生产</option>
            <option value="in_progress">生产中</option>
            <option value="completed">已完成</option>
          </select>
        </label>
        <p class="error">{{ editError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showEdit = false">取消</button>
          <button class="btn-save" @click="saveEdit">保存</button>
        </div>
      </div>
    </div>
  </MainLayout>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue';
import MainLayout from '../layouts/MainLayout.vue';
import { CONFIG } from '../config.js';
import { listDocs, getDoc, createDoc, updateDoc, batchImport } from '../api/db.js';
import { exportCSV, readCSV } from '../api/csv.js';
import { Query } from 'appwrite';

const WO_HEADERS = ['wo_number', 'product_number', 'product_name', 'plan_qty', 'produce_date', 'status'];

const docs = ref([]);
const fileInput = ref(null);
const showAdd = ref(false);
const showEdit = ref(false);
const formError = ref('');
const editError = ref('');

const form = reactive({
  wo_number: '', product_number: '', product_name: '',
  plan_qty: '', produce_date: '', status: 'pending'
});
const editForm = reactive({
  $id: '', wo_number: '', product_number: '', product_name: '',
  plan_qty: '', produce_date: '', status: 'pending'
});

function statusText(s) {
  return s === 'completed' ? '已完成' : s === 'in_progress' ? '生产中' : '待生产';
}

async function load() {
  const res = await listDocs(CONFIG.TABLES.wo);
  docs.value = res.documents;
}

onMounted(load);

/* 新增 */
function openAdd() {
  Object.assign(form, {
    wo_number: '', product_number: '', product_name: '',
    plan_qty: '', produce_date: '', status: 'pending'
  });
  formError.value = '';
  showAdd.value = true;
}
async function saveAdd() {
  if (!form.wo_number || !form.product_name || !form.plan_qty) {
    formError.value = '工单号、产品名称、计划数量必填';
    return;
  }
  try {
    await createDoc(CONFIG.TABLES.wo, { ...form, plan_qty: Number(form.plan_qty) });
    showAdd.value = false;
    load();
  } catch (e) {
    formError.value = '保存失败：' + (e.message || e);
  }
}

/* 编辑 */
async function openEdit(docId) {
  try {
    const doc = await getDoc(CONFIG.TABLES.wo, docId);
    if (doc.status === 'completed') {
      alert('该工单已完成，不允许修改。');
      return;
    }
    Object.assign(editForm, {
      $id: doc.$id,
      wo_number: doc.wo_number || '',
      product_number: doc.product_number || '',
      product_name: doc.product_name || '',
      plan_qty: doc.plan_qty || '',
      produce_date: doc.produce_date || '',
      status: doc.status || 'pending'
    });
    editError.value = '';
    showEdit.value = true;
  } catch (e) {
    alert('读取工单失败：' + e.message);
  }
}
async function saveEdit() {
  if (!editForm.product_name || !editForm.plan_qty) {
    editError.value = '产品名称和计划数量必填';
    return;
  }
  try {
    const current = await getDoc(CONFIG.TABLES.wo, editForm.$id);
    if (current.status === 'completed') {
      editError.value = '该工单已完成，不允许修改。';
      setTimeout(() => { showEdit.value = false; load(); }, 1200);
      return;
    }
    await updateDoc(CONFIG.TABLES.wo, editForm.$id, {
      product_number: editForm.product_number,
      product_name: editForm.product_name,
      plan_qty: Number(editForm.plan_qty),
      produce_date: editForm.produce_date,
      status: editForm.status
    });
    showEdit.value = false;
    load();
  } catch (e) {
    editError.value = '保存失败：' + (e.message || e);
  }
}

/* 导入导出 */
function triggerImport() { fileInput.value.click(); }
async function handleImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);
  await batchImport(CONFIG.TABLES.wo, headers, rows);
  load();
  e.target.value = '';
}
async function handleExport() {
  const res = await listDocs(CONFIG.TABLES.wo);
  const rows = res.documents.map(d => WO_HEADERS.map(h => d[h] ?? ''));
  exportCSV(WO_HEADERS, rows, 'work_orders');
}
</script>
