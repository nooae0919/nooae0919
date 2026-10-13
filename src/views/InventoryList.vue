<template>
  <MainLayout>
    <div v-if="filterPart" class="notice">
      当前仅显示物料料号 <b>{{ filterPart }}</b> 的库存明细。
      <a href="#" @click.prevent="clearFilter">清除过滤</a>
    </div>

    <div class="search-bar">
      <input v-model="keyword" type="text" placeholder="按库位搜索...">
      <button @click="applyFilters">搜索</button>
      <button @click="clearAll">清空</button>
    </div>

    <div class="toolbar">
      <button @click="openAdd">新增库存</button>
      <button @click="triggerImport">导入CSV</button>
      <button @click="handleExport">导出CSV</button>
      <input type="file" accept=".csv" hidden ref="fileInput" @change="handleImport">
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:60px;">序号</th>
          <th>物料料号</th>
          <th>物料名称</th>
          <th>物料数量</th>
          <th>库位</th>
          <th>来源</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(d, idx) in filteredDocs" :key="d.$id">
          <td>{{ idx + 1 }}</td>
          <td>{{ d.part_number || '' }}</td>
          <td>{{ d.part_name || '' }}</td>
          <td><span class="qty-badge">{{ d.quantity ?? 0 }}</span></td>
          <td>{{ d.location || '' }}</td>
          <td>
            <span v-if="d.source_wo" style="color:#2563eb;font-size:13px;">
              工单 {{ d.source_wo }}
            </span>
            <span v-else style="color:#999;font-size:13px;">正常</span>
          </td>
          <td>
            <button @click="openEdit(d.$id)">编辑</button>
            <button @click="deleteInv(d.$id)">删除</button>
          </td>
        </tr>
        <tr v-if="!filteredDocs.length">
          <td colspan="7" style="text-align:center;color:#999;">暂无库存数据</td>
        </tr>
      </tbody>
    </table>

    <!-- 新增 / 编辑弹窗 -->
    <div v-if="showModal" class="modal-mask">
      <div class="modal-box">
        <h3>{{ form.id ? '编辑库存' : '新增库存' }}</h3>
        <label>物料料号
          <input v-model="form.part_number" type="text" placeholder="如 M-2001"
                 :disabled="!!form.id || form.isAuto">
        </label>
        <label>物料名称
          <input v-model="form.part_name" type="text" placeholder="如 电阻0603">
        </label>
        <label>物料数量
          <input v-model.number="form.quantity" type="number" placeholder="如 1000"
                 :disabled="form.isAuto">
        </label>
        <label>库位
          <input v-model="form.location" type="text" placeholder="如 A-1-01"
                 :disabled="form.isAuto">
        </label>
        <p class="error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showModal = false">取消</button>
          <button class="btn-save" @click="saveForm">保存</button>
        </div>
      </div>
    </div>
  </MainLayout>
</template>

<script setup>
import { ref, onMounted, computed, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import { CONFIG } from '../config.js';
import { listDocs, getDoc, createDoc, updateDoc, deleteDoc } from '../api/db.js';
import { exportCSV, readCSV } from '../api/csv.js';
import { Query } from 'appwrite';

const route = useRoute();
const router = useRouter();

const allDocs = ref([]);
const keyword = ref('');
const filterPart = ref(route.query.part || null);
const fileInput = ref(null);
const showModal = ref(false);
const formError = ref('');
const form = reactive({
  id: '', part_number: '', part_name: '', quantity: '', location: '', isAuto: false
});

const filteredDocs = computed(() => {
  let docs = allDocs.value;
  if (filterPart.value) docs = docs.filter(d => d.part_number === filterPart.value);
  const kw = keyword.value.trim().toLowerCase();
  if (kw) docs = docs.filter(d => (d.location || '').toLowerCase().includes(kw));
  return docs;
});

async function load() {
  const res = await listDocs(CONFIG.TABLES.inventory, [
    Query.limit(5000),
    Query.orderAsc('part_number')
  ]);
  allDocs.value = res.documents;
}

onMounted(load);

function applyFilters() { /* computed 自动响应 */ }

function clearAll() {
  keyword.value = '';
  filterPart.value = null;
  router.replace({ name: 'inventory' });
}
function clearFilter() {
  filterPart.value = null;
  router.replace({ name: 'inventory' });
}

function openAdd() {
  Object.assign(form, {
    id: '', part_number: '', part_name: '', quantity: '', location: '', isAuto: false
  });
  formError.value = '';
  showModal.value = true;
}

async function openEdit(docId) {
  try {
    const doc = await getDoc(CONFIG.TABLES.inventory, docId);
    const isAuto = !!doc.source_wo;
    Object.assign(form, {
      id: doc.$id,
      part_number: doc.part_number || '',
      part_name: doc.part_name || '',
      quantity: doc.quantity ?? '',
      location: doc.location || '',
      isAuto
    });
    formError.value = isAuto
      ? `该记录由工单 ${doc.source_wo} 超发自动生成，数量/库位/料号不可改。`
      : '';
    showModal.value = true;
  } catch (e) {
    alert('读取失败：' + e.message);
  }
}

async function saveForm() {
  const part_number = (form.part_number || '').trim();
  const part_name = (form.part_name || '').trim();
  const location = (form.location || '').trim();
  const quantity = Number(form.quantity);

  if (!part_number || !part_name || !location) {
    formError.value = '物料料号、物料名称、库位必填';
    return;
  }
  if (isNaN(quantity) || quantity < 0) {
    formError.value = '物料数量必须是非负整数';
    return;
  }

  try {
    if (form.id) {
      // 超发记录只允许改名称
      if (form.isAuto) {
        await updateDoc(CONFIG.TABLES.inventory, form.id, { part_name });
      } else {
        await updateDoc(CONFIG.TABLES.inventory, form.id, { part_name, quantity, location });
      }
    } else {
      const dup = await listDocs(CONFIG.TABLES.inventory, [
        Query.equal('location', location), Query.limit(1)
      ]);
      if (dup.documents.length && dup.documents[0].part_number !== part_number) {
        formError.value = `库位 ${location} 已被物料 ${dup.documents[0].part_number} 占用`;
        return;
      }
      await createDoc(CONFIG.TABLES.inventory, { part_number, part_name, quantity, location });
    }
    showModal.value = false;
    await load();
  } catch (e) {
    formError.value = '保存失败：' + (e.message || e);
  }
}

async function deleteInv(docId) {
  try {
    const doc = await getDoc(CONFIG.TABLES.inventory, docId);
    const isAuto = !!doc.source_wo;
    const msg = isAuto
      ? `该记录由工单 ${doc.source_wo} 超发自动生成。\n手动删除后，下次领料/工单变动可能重新生成。\n确认删除？`
      : '确认删除该库存记录？';
    const ok = window.$confirm
      ? await window.$confirm({ title: '删除确认', message: msg })
      : confirm(msg);
    if (!ok) return;

    await deleteDoc(CONFIG.TABLES.inventory, docId);
    await load();
  } catch (e) {
    alert('删除失败：' + e.message);
  }
}

function triggerImport() { fileInput.value.click(); }

async
