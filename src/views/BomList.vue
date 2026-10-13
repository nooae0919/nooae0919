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

const sleep = ms => new Promise(r => setTimeout(r, ms));
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
  Object.assign(form, { id: '', product_number: '', product_name: '', version: '', remark: '' });
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

/* ============ 导入 CSV（扁平模板） ============ */
function triggerImport() { fileInput.value.click(); }

async function handleImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);

  // 必需列（序号可以省略；其它必填）
  const required = ['成品料号', '成品名称', '版本号', '物料料号', '物料名称', '单板用量'];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    alert('CSV 缺少必需列：' + missing.join('、') +
          '\n\n模板列应为：\n序号,成品料号,成品名称,版本号,物料料号,物料名称,单板用量');
    e.target.value = '';
    return;
  }

  // 索引定位
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });

  // 一次性拉取已有 BOM 头，避免循环里重复查询
  const existingBomRes = await listDocs(CONFIG.TABLES.bom, [Query.limit(10000)]);
  const bomKeyToId = {};   // "料号|名称|版本" -> bom_id
  existingBomRes.documents.forEach(b => {
    const key = `${b.product_number || ''}|${b.product_name || ''}|${b.version || ''}`;
    bomKeyToId[key] = b.$id;
  });

  let okBom = 0, okItem = 0, fail = 0;
  const errors = [];
  const touchedBomIds = new Set();

  // 逐行处理
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const product_number = String(row[idx['成品料号']] || '').trim();
    const product_name = String(row[idx['成品名称']] || '').trim();
    const version = String(row[idx['版本号']] || '').trim();
    const part_number = String(row[idx['物料料号']] || '').trim();
    const part_name = String(row[idx['物料名称']] || '').trim();
    const qtyRaw = row[idx['单板用量']];

    if (!product_number || !version || !part_number) {
      errors.push(`第 ${i + 2} 行：成品料号 / 版本号 / 物料料号 不能为空`);
      fail++;
      continue;
    }

    const qty = Number(qtyRaw);
    if (isNaN(qty)) {
      errors.push(`第 ${i + 2} 行：单板用量不是数字（${qtyRaw}）`);
      fail++;
      continue;
    }

    const bomKey = `${product_number}|${product_name}|${version}`;

    try {
      // 1. 找/建 BOM 头
      let bomId = bomKeyToId[bomKey];
      if (!bomId) {
        const newBom = await createDoc(CONFIG.TABLES.bom, {
          product_number,
          product_name,
          version
        });
        bomId = newBom.$id;
        bomKeyToId[bomKey] = bomId;
        okBom++;
        await sleep(30);
      }

      // 2. 写明细
      await createDoc(CONFIG.TABLES.bomItem, {
        bom_id: bomId,
        part_number,
        part_name,
        qty_per_board: qty
      });
      okItem++;
      touchedBomIds.add(bomId);
      await sleep(30);
    } catch (err) {
      errors.push(`第 ${i + 2} 行：${err.message}`);
      fail++;
    }
  }

  let msg = `导入完成：\n` +
            `- 新建 BOM 头：${okBom} 张\n` +
            `- 写入 BOM 明细：${okItem} 条\n` +
            `- 失败：${fail} 条`;
  if (errors.length) {
    msg += '\n\n失败明细（前 10 条）：\n' + errors.slice(0, 10).join('\n');
    if (errors.length > 10) msg += `\n...还有 ${errors.length - 10} 条`;
  }
  alert(msg);

  await load();
  e.target.value = '';
}

/* ============ 导出 CSV（扁平模板） ============ */
async function handleExport() {
  // 拉全部 BOM + 明细
  const [bomRes, itemRes] = await Promise.all([
    listDocs(CONFIG.TABLES.bom, [Query.limit(10000)]),
    listDocs(CONFIG.TABLES.bomItem, [Query.limit(50000)])
  ]);

  const bomMap = {};
  bomRes.documents.forEach(b => { bomMap[b.$id] = b; });

  // 明细按 bom_id 分组
  const itemsByBom = {};
  itemRes.documents.forEach(it => {
    const id = it.bom_id; if (!id) return;
    if (!itemsByBom[id]) itemsByBom[id] = [];
    itemsByBom[id].push(it);
  });

  const headers = ['序号', '成品料号', '成品名称', '版本号', '物料料号', '物料名称', '单板用量'];
  const data = [];

  // 遍历 BOM（按成品料号排序），每组内部按物料料号排序
  const sortedBoms = bomRes.documents.slice().sort((a, b) =>
    (a.product_number || '').localeCompare(b.product_number || '') ||
    (a.version || '').localeCompare(b.version || '')
  );

  let seq = 1;
  for (const b of sortedBoms) {
    const items = (itemsByBom[b.$id] || []).slice().sort((x, y) =>
      (x.part_number || '').localeCompare(y.part_number || '')
    );
    for (const it of items) {
      data.push([
        seq++,
        b.product_number || '',
        b.product_name || '',
        b.version || '',
        it.part_number || '',
        it.part_name || '',
        it.qty_per_board ?? ''
      ]);
    }
  }

  if (!data.length) {
    alert('暂无 BOM 明细可导出');
    return;
  }

  exportCSV(headers, data, 'bom_list');
}
</script>
