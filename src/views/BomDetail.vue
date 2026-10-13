<template>
  <MainLayout>
    <div class="page-header">
      <div class="page-title">BOM 详情</div>
      <ActionMenu :items="menuItems" />
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

    <!-- 明细 -->
    <div class="toolbar" style="margin-top:24px;">
      <h3 style="flex:1;">BOM 明细（{{ items.length }} 条）</h3>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:60px;">序号</th>
          <th>物料料号</th>
          <th>物料名称</th>
          <th>单板用量</th>
          <th style="width:160px;">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(it, idx) in items" :key="it.$id">
          <td>{{ idx + 1 }}</td>
          <td>{{ it.part_number || '' }}</td>
          <td>{{ it.part_name || '' }}</td>
          <td><b>{{ it.qty_per_board ?? '' }}</b></td>
          <td>
            <button @click="openEdit(it.$id)">编辑</button>
            <button @click="deleteItem(it.$id)">删除</button>
          </td>
        </tr>
        <tr v-if="!items.length">
          <td colspan="5" style="text-align:center;color:#999;">暂无明细</td>
        </tr>
      </tbody>
    </table>

    <input type="file" accept=".csv" hidden ref="fileInput" @change="handleImport">

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
import { useRoute, useRouter } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import ActionMenu from '../components/ActionMenu.vue';
import { CONFIG } from '../config.js';
import { listDocs, getDoc, createDoc, updateDoc, deleteDoc } from '../api/db.js';
import { exportCSV, readCSV } from '../api/csv.js';
import { Query } from 'appwrite';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const props = defineProps({ id: String });
const route = useRoute();
const router = useRouter();
const bomId = computed(() => props.id || route.params.id);

const bom = ref(null);
const items = ref([]);
const fileInput = ref(null);
const showModal = ref(false);
const formError = ref('');

const form = reactive({
  id: '', part_number: '', part_name: '', qty_per_board: ''
});

const menuItems = computed(() => [
  { label: '返回列表', onClick: () => router.push('/bom') },
  { label: '新增物料', onClick: openAdd },
  { label: '导入CSV', onClick: triggerImport },
  { label: '导出CSV', onClick: handleExport, disabled: !items.value.length }
]);

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
async function loadAll() { await loadBom(); await loadItems(); }
watch(bomId, loadAll);

onMounted(() => {
  if (!bomId.value) { alert('未指定 BOM ID'); return; }
  loadAll();
});

/* 新增 */
function openAdd() {
  Object.assign(form, { id: '', part_number: '', part_name: '', qty_per_board: '' });
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
    qty_per_board: doc.qty_per_board ?? ''
  });
  formError.value = '';
  showModal.value = true;
}

/* 保存（⭐ 冗余写入 BOM 头信息） */
async function saveForm() {
  if (!form.part_number || !form.qty_per_board) {
    formError.value = '物料料号和单板用量必填';
    return;
  }
  if (!bom.value) {
    formError.value = 'BOM 头信息未加载完成，请稍候';
    return;
  }

  const payload = {
    bom_id: bomId.value,
    product_number: bom.value.product_number || '',
    product_name: bom.value.product_name || '',
    version: bom.value.version || '',
    part_number: form.part_number,
    part_name: form.part_name,
    qty_per_board: Number(form.qty_per_board)
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

/* ============ 导入 CSV（扁平模板） ============ */
function triggerImport() { fileInput.value.click(); }

async function handleImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);

  const required = ['成品料号', '成品名称', '版本号', '物料料号', '物料名称', '单板用量'];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    alert('CSV 缺少必需列：' + missing.join('、') +
          '\n\n模板列应为：\n序号,成品料号,成品名称,版本号,物料料号,物料名称,单板用量');
    e.target.value = '';
    return;
  }

  if (!bom.value) {
    alert('BOM 未加载完成，请稍候再试。');
    e.target.value = '';
    return;
  }

  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });

  const curPn = bom.value.product_number || '';
  const curName = bom.value.product_name || '';
  const curVer = bom.value.version || '';

  let ok = 0, skip = 0, fail = 0;
  const errors = [];
  const skipMismatch = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const product_number = String(row[idx['成品料号']] || '').trim();
    const product_name = String(row[idx['成品名称']] || '').trim();
    const version = String(row[idx['版本号']] || '').trim();
    const part_number = String(row[idx['物料料号']] || '').trim();
    const part_name = String(row[idx['物料名称']] || '').trim();
    const qtyRaw = row[idx['单板用量']];

    if (!product_number && !part_number && !qtyRaw) continue;

    // 必须和当前 BOM 一致
    if (product_number !== curPn || product_name !== curName || version !== curVer) {
      skipMismatch.push(`第 ${i + 2} 行：${product_number} / ${product_name} / ${version}`);
      skip++;
      continue;
    }

    if (!part_number) {
      errors.push(`第 ${i + 2} 行：物料料号为空`);
      fail++;
      continue;
    }

    const qty = Number(qtyRaw);
    if (isNaN(qty)) {
      errors.push(`第 ${i + 2} 行：单板用量不是数字（${qtyRaw}）`);
      fail++;
      continue;
    }

    try {
      await createDoc(CONFIG.TABLES.bomItem, {
        bom_id: bomId.value,
        product_number: curPn,       // ⭐ 冗余写入
        product_name: curName,
        version: curVer,
        part_number,
        part_name,
        qty_per_board: qty
      });
      ok++;
      await sleep(30);
    } catch (err) {
      errors.push(`第 ${i + 2} 行：${err.message}`);
      fail++;
    }
  }

  let msg = `导入完成：\n- 成功：${ok} 条\n- 跳过（BOM 不匹配）：${skip} 条\n- 失败：${fail} 条`;

  if (skipMismatch.length) {
    msg += `\n\n与当前 BOM 不一致被跳过的行（前 5 条）：\n` +
           skipMismatch.slice(0, 5).join('\n');
    if (skipMismatch.length > 5) msg += `\n...还有 ${skipMismatch.length - 5} 条`;
    msg += `\n\n当前 BOM：${curPn} / ${curName} / ${curVer}`;
  }

  if (errors.length) {
    msg += `\n\n失败明细（前 10 条）：\n` + errors.slice(0, 10).join('\n');
    if (errors.length > 10) msg += `\n...还有 ${errors.length - 10} 条`;
  }

  alert(msg);

  await loadItems();
  e.target.value = '';
}

/* ============ 导出 CSV ============ */
function handleExport() {
  if (!items.value.length) {
    alert('暂无可导出的明细');
    return;
  }
  const headers = ['序号', '成品料号', '成品名称', '版本号', '物料料号', '物料名称', '单板用量'];
  const data = items.value.map((it, i) => [
    i + 1,
    it.product_number || bom.value?.product_number || '',
    it.product_name || bom.value?.product_name || '',
    it.version || bom.value?.version || '',
    it.part_number || '',
    it.part_name || '',
    it.qty_per_board ?? ''
  ]);
  exportCSV(headers, data, `bom_items_${bom.value?.product_number || bomId.value}`);
}
</script>
