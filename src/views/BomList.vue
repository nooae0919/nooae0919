<template>
  <MainLayout>
    <div class="toolbar">
      <button @click="openAdd">新建 BOM</button>
      <button @click="triggerImport">导入CSV</button>
      <button @click="handleExport">导出CSV</button>
      <input type="file" accept=".csv" hidden ref="fileInput" @change="handleImport">
    </div>

    <div class="search-bar">
      <input v-model="keyword" type="text" placeholder="按成品料号 / 名称 / 版本搜索...">
    </div>

    <table id="bom-table">
      <thead>
        <tr>
          <th style="width:60px;">序号</th>
          <th>成品料号</th>
          <th>成品名称</th>
          <th>版本号</th>
          <th style="width:120px;">BOM条目数</th>
          <th>更新时间</th>
          <th style="width:220px;">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(d, idx) in filteredDocs" :key="d.$id">
          <td>{{ idx + 1 }}</td>
          <td>
            <a class="part-link" href="#" @click.prevent="goDetail(d.$id)">
              {{ d.product_number || '' }}
            </a>
          </td>
          <td>{{ d.product_name || '' }}</td>
          <td>{{ d.version || '' }}</td>
          <td>{{ itemCountMap[d.$id] || 0 }}</td>
          <td>{{ formatTime(d.$updatedAt) }}</td>
          <td>
            <button @click="goDetail(d.$id)">详情</button>
            <button @click="openEdit(d.$id)">编辑</button>
            <button @click="deleteRow(d.$id)">删除</button>
          </td>
        </tr>
        <tr v-if="!filteredDocs.length">
          <td colspan="7" style="text-align:center;color:#999;">暂无 BOM 数据</td>
        </tr>
      </tbody>
    </table>

    <!-- 新增 / 编辑弹窗 -->
    <div v-if="showModal" class="modal-mask">
      <div class="modal-box">
        <h3>{{ form.id ? '编辑 BOM' : '新建 BOM' }}</h3>
        <label>成品料号
          <input v-model="form.product_number" type="text" placeholder="如 P-1001">
        </label>
        <label>成品名称
          <input v-model="form.product_name" type="text" placeholder="如 主控板成品">
        </label>
        <label>版本号
          <input v-model="form.version" type="text" placeholder="如 V1.0">
        </label>
        <label>备注
          <input v-model="form.remark" type="text" placeholder="可选">
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
import { useRouter } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import { CONFIG } from '../config.js';
import { listDocs, getDoc, createDoc, updateDoc, deleteDoc } from '../api/db.js';
import { exportCSV, readCSV } from '../api/csv.js';
import { Query } from 'appwrite';

const router = useRouter();

const docs = ref([]);
const itemCountMap = ref({});
const keyword = ref('');
const fileInput = ref(null);
const showModal = ref(false);
const formError = ref('');

const form = reactive({
  id: '',
  product_number: '',
  product_name: '',
  version: '',
  remark: ''
});

const filteredDocs = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return docs.value;
  return docs.value.filter(d =>
    (d.product_number || '').toLowerCase().includes(kw) ||
    (d.product_name || '').toLowerCase().includes(kw) ||
    (d.version || '').toLowerCase().includes(kw)
  );
});

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function load() {
  const res = await listDocs(CONFIG.TABLES.bom, [
    Query.limit(5000),
    Query.orderDesc('$updatedAt')
  ]);
  docs.value = res.documents;

  // 统计每个 BOM 的明细条目数
  const itemRes = await listDocs(CONFIG.TABLES.bomItem, [Query.limit(10000)]);
  const map = {};
  itemRes.documents.forEach(it => {
    const id = it.bom_id; if (!id) return;
    map[id] = (map[id] || 0) + 1;
  });
  itemCountMap.value = map;
}

onMounted(load);

/* 新建 */
function openAdd() {
  Object.assign(form, {
    id: '', product_number: '', product_name: '', version: '', remark: ''
  });
  formError.value = '';
  showModal.value = true;
}

/* 编辑 */
async function openEdit(docId) {
  const doc = await getDoc(CONFIG.TABLES.bom, docId);
  Object.assign(form, {
    id: doc.$id,
    product_number: doc.product_number || '',
    product_name: doc.product_name || '',
    version: doc.version || '',
    remark: doc.remark || ''
  });
  formError.value = '';
  showModal.value = true;
}

/* 保存 */
async function saveForm() {
  if (!form.product_number || !form.version) {
    formError.value = '成品料号和版本号必填';
    return;
  }
  try {
    const payload = {
      product_number: form.product_number,
      product_name: form.product_name,
      version: form.version,
      remark: form.remark
    };
    if (form.id) {
      await updateDoc(CONFIG.TABLES.bom, form.id, payload);
    } else {
      await createDoc(CONFIG.TABLES.bom, payload);
    }
    showModal.value = false;
    await load();
  } catch (e) {
    formError.value = '保存失败：' + (e.message || e);
  }
}

/* 删除 */
async function deleteRow(docId) {
  const ok = window.$confirm
    ? await window.$confirm({ title: '删除确认', message: '删除 BOM 会同时删除其明细，确认删除？' })
    : confirm('删除 BOM 会同时删除其明细，确认删除？');
  if (!ok) return;

  try {
    const items = await listDocs(CONFIG.TABLES.bomItem, [
      Query.equal('bom_id', docId), Query.limit(5000)
    ]);
    for (const it of items.documents) {
      await deleteDoc(CONFIG.TABLES.bomItem, it.$id);
    }
    await deleteDoc(CONFIG.TABLES.bom, docId);
    await load();
  } catch (e) {
    alert('删除失败：' + e.message);
  }
}

/* 进入详情 */
function goDetail(id) {
  router.push({ name: 'bom-detail', params: { id } });
}

/* 导入 CSV（BOM 头） */
function triggerImport() { fileInput.value.click(); }

async function handleImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);

  const required = ['product_number', 'product_name', 'version'];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    alert('CSV 缺少必需列：' + missing.join(', '));
    e.target.value = '';
    return;
  }

  let ok = 0, fail = 0;
  for (const row of rows) {
    const data = {};
    headers.forEach((h, i) => {
      const v = row[i];
      if (v === undefined || v === null || v === '') return;
      data[h] = String(v).trim();
    });
    if (!data.product_number || !data.version) continue;

    try {
      await createDoc(CONFIG.TABLES.bom, data);
      ok++;
    } catch (err) {
      console.error('导入失败', data, err.message);
      fail++;
    }
  }
  alert(`导入完成：成功 ${ok} 条，失败 ${fail} 条`);
  await load();
  e.target.value = '';
}

/* 导出 CSV */
async function handleExport() {
  const headers = ['product_number', 'product_name', 'version', 'remark'];
  const rows = docs.value.map(d => headers.map(h => d[h] ?? ''));
  exportCSV(headers, rows, 'bom_list');
}
</script>
