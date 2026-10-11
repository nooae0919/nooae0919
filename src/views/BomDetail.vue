<template>
  <MainLayout>
    <div class="toolbar">
      <button @click="$router.push('/bom')">← 返回列表</button>
    </div>

    <!-- BOM 头信息 -->
    <div class="card" v-if="bom">
      <h2>
        {{ bom.product_number }}
        <small style="color:#999;font-size:14px;">({{ bom.version }})</small>
      </h2>
      <div class="wo-meta">
        <span>成品料号：<b>{{ bom.product_number || '-' }}</b></span>
        <span>成品名称：<b>{{ bom.product_name || '-' }}</b></span>
        <span>版本号：<b>{{ bom.version || '-' }}</b></span>
        <span>备注：<b>{{ bom.remark || '-' }}</b></span>
        <span>更新时间：<b>{{ formatTime(bom.$updatedAt) }}</b></span>
      </div>
    </div>

    <!-- 明细表 -->
    <div class="toolbar" style="margin-top:24px;">
      <h3 style="flex:1;">BOM 明细（{{ items.length }} 条）</h3>
      <button @click="openAdd">新增物料</button>
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
          <th>单板用量</th>
          <th>单位</th>
          <th style="width:160px;">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(it, idx) in items" :key="it.$id">
          <td>{{ idx + 1 }}</td>
          <td>{{ it.part_number || '' }}</td>
          <td>{{ it.part_name || '' }}</td>
          <td><b>{{ it.qty_per_board ?? '' }}</b></td>
          <td>{{ it.unit || '' }}</td>
          <td>
            <button @click="openEdit(it.$id)">编辑</button>
            <button @click="deleteItem(it.$id)">删除</button>
          </td>
        </tr>
        <tr v-if="!items.length">
          <td colspan="6" style="text-align:center;color:#999;">暂无明细</td>
        </tr>
      </tbody>
    </table>

    <!-- 新增 / 编辑明细弹窗 -->
    <div v-if="showModal" class="modal-mask">
      <div class="modal-box">
        <h3>{{ form.id ? '编辑物料' : '新增物料' }}</h3>
        <label>物料料号
          <input v-model="form.part_number" type="text" placeholder="如 M-2001">
        </label>
        <label>物料名称
          <input v-model="form.part_name" type="text" placeholder="如 贴片电阻">
        </label>
        <label>单板用量
          <input v-model.number="form.qty_per_board" type="number" step="any" placeholder="如 12">
        </label>
        <label>单位
          <input v-model="form.unit" type="text" placeholder="如 PCS / 卷">
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
import { ref, onMounted, computed, reactive, watch } from 'vue';
import { useRoute } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import { CONFIG } from '../config.js';
import { listDocs, getDoc, createDoc, updateDoc, deleteDoc } from '../api/db.js';
import { exportCSV, readCSV } from '../api/csv.js';
import { Query } from 'appwrite';

const props = defineProps({ id: String });
const route = useRoute();
const bomId = computed(() => props.id || route.params.id);

const bom = ref(null);
const items = ref([]);
const fileInput = ref(null);
const showModal = ref(false);
const formError = ref('');

const form = reactive({
  id: '',
  part_number: '',
  part_name: '',
  qty_per_board: '',
  unit: ''
});

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadBom() {
  bom.value = await getDoc(CONFIG.TABLES.bom, bomId.value);
}

async function loadItems() {
  const res = await listDocs(CONFIG.TABLES.bomItem, [
    Query.equal('bom_id', bomId.value),
    Query.orderAsc('part_number'),
    Query.limit(5000)
  ]);
  items.value = res.documents;
}

async function loadAll() {
  await loadBom();
  await loadItems();
}

watch(bomId, loadAll);

onMounted(() => {
  if (!bomId.value) { alert('未指定 BOM ID'); return; }
  loadAll();
});

/* 新增 */
function openAdd() {
  Object.assign(form, {
    id: '', part_number: '', part_name: '', qty_per_board: '', unit: ''
  });
  formError.value = '';
  showModal.value = true;
}

/* 编辑 */
async function openEdit(itemId) {
  const doc = await getDoc(CONFIG.TABLES.bomItem, itemId);
  Object.assign(form, {
    id: doc.$id,
    part_number: doc.part_number || '',
    part_name: doc.part_name || '',
    qty_per_board: doc.qty_per_board ?? '',
    unit: doc.unit || ''
  });
  formError.value = '';
  showModal.value = true;
}

async function saveForm() {
  if (!form.part_number || !form.qty_per_board) {
    formError.value = '物料料号和单板用量必填';
    return;
  }
  const payload = {
    bom_id: bomId.value,
    part_number: form.part_number,
    part_name: form.part_name,
    qty_per_board: Number(form.qty_per_board),
    unit: form.unit
  };
  try {
    if (form.id) {
      await updateDoc(CONFIG.TABLES.bomItem, form.id, payload);
    } else {
      await createDoc(CONFIG.TABLES.bomItem, payload);
    }
    showModal.value = false;
    await loadItems();
  } catch (e) {
    formError.value = '保存失败：' + (e.message || e);
  }
}

/* 删除 */
async function deleteItem(itemId) {
  const ok = window.$confirm
    ? await window.$confirm({ title: '删除确认', message: '确认删除该物料？' })
    : confirm('确认删除该物料？');
  if (!ok) return;

  try {
    await deleteDoc(CONFIG.TABLES.bomItem, itemId);
    await loadItems();
  } catch (e) {
    alert('删除失败：' + e.message);
  }
}

/* 导入明细 */
function triggerImport() { fileInput.value.click(); }

async function handleImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);

  const required = ['part_number', 'part_name', 'qty_per_board'];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    alert('CSV 缺少必需列：' + missing.join(', '));
    e.target.value = '';
    return;
  }

  let ok = 0, fail = 0;
  for (const row of rows) {
    const data = { bom_id: bomId.value };
    headers.forEach((h, i) => {
      const v = row[i];
      if (v === undefined || v === null || v === '') return;
      if (h === 'qty_per_board') {
        const n = Number(v); if (isNaN(n)) return;
        data[h] = n;
      } else {
        data[h] = String(v).trim();
      }
    });
    if (!data.part_number || !data.qty_per_board) continue;

    try {
      await createDoc(CONFIG.TABLES.bomItem, data);
      ok++;
    } catch (err) {
      console.error('导入失败', data, err.message);
      fail++;
    }
  }
  alert(`导入完成：成功 ${ok} 条，失败 ${fail} 条`);
  await loadItems();
  e.target.value = '';
}

/* 导出明细 */
function handleExport() {
  const headers = ['part_number', 'part_name', 'qty_per_board', 'unit'];
  const rows = items.value.map(d => [
    d.part_number ?? '',
    d.part_name ?? '',
    d.qty_per_board ?? '',
    d.unit ?? ''
  ]);
  exportCSV(headers, rows, `bom_items_${bom.value?.product_number || bomId.value}`);
}
</script>
