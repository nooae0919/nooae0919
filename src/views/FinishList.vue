<template>
  <MainLayout>
    <div class="page-header">
      <div class="search-bar">
        <input v-model="keyword" type="text" placeholder="按入库单号 / 工单号 / 入库人搜索...">
      </div>
      <ActionMenu :items="menuItems" />
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:44px;">
            <input type="checkbox" :checked="allSelected" :indeterminate="someSelected" @change="toggleSelectAll">
          </th>
          <th style="width:60px;">序号</th>
          <th>入库单号</th>
          <th>工单号</th>
          <th>成品料号</th>
          <th>成品名称</th>
          <th>物料种类</th>
          <th>入库总数</th>
          <th>入库人</th>
          <th>入库时间</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(b, idx) in paginatedBatches" :key="b.key">
          <td><input type="checkbox" :value="b.key" v-model="selectedKeys"></td>
          <td>{{ (currentPage - 1) * PAGE_SIZE + idx + 1 }}</td>
          <td>{{ b.finish_no || '(无单号)' }}</td>
          <td>{{ b.wo_number || '' }}</td>
          <td>{{ b.product_number || '' }}</td>
          <td>{{ b.product_name || '' }}</td>
          <td>{{ b.itemCount }} 种</td>
          <td><b>{{ b.totalQty }}</b></td>
          <td>{{ b.operator || '' }}</td>
          <td>{{ b.finished_at || '' }}</td>
        </tr>
        <tr v-if="!loading && !paginatedBatches.length">
          <td colspan="10" style="text-align:center;color:#999;">暂无入库单</td>
        </tr>
      </tbody>
    </table>
    <Pagination v-model:page="currentPage" :total="total" :loading="loading" />

    <input type="file" accept=".csv" hidden ref="fileInput" @change="handleImport">

    <div v-if="showAdd" class="modal-mask">
      <div class="modal-box" style="width:760px;max-width:94vw;">
        <h3>新增入库单</h3>
        <label>工单
          <select v-model="addForm.wo_number" @change="onWoChange">
            <option value="">— 请选择工单 —</option>
            <option v-for="w in woList" :key="w.$id" :value="w.wo_number">
              {{ w.wo_number }} / {{ w.product_number }} / {{ w.product_name }}
            </option>
          </select>
        </label>
        <label>入库人
          <input v-model="addForm.operator" type="text" placeholder="默认当前登录用户">
        </label>
        <div style="margin:8px 0;font-size:13px;color:#555;display:flex;justify-content:space-between;align-items:center;">
          <span>成品明细</span>
          <button class="btn-cancel" style="padding:4px 10px;" @click="addRow">+ 加一行</button>
        </div>
        <table style="margin-bottom:12px;">
          <thead>
            <tr>
              <th style="width:50px;">#</th>
              <th>成品料号</th>
              <th>成品名称</th>
              <th style="width:120px;">数量</th>
              <th style="width:70px;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in addForm.items" :key="i">
              <td>{{ i + 1 }}</td>
              <td><input v-model="r.product_number" type="text" style="margin:0;"></td>
              <td><input v-model="r.product_name" type="text" style="margin:0;"></td>
              <td><input v-model.number="r.finish_qty" type="number" style="margin:0;"></td>
              <td>
                <button class="btn-cancel" style="padding:4px 8px;"
                        @click="removeRow(i)" :disabled="addForm.items.length <= 1">删</button>
              </td>
            </tr>
          </tbody>
        </table>
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
import { ref, onMounted, computed, reactive, watch } from 'vue';
import { useRouter } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import ActionMenu from '../components/ActionMenu.vue';
import Pagination from '../components/Pagination.vue';
import { PAGE_SIZE, usePagination } from '../composables/usePagination.js';
import { CONFIG } from '../config.js';
import { listDocs, createDoc, updateDoc, deleteDoc } from '../api/db.js';
import { exportCSV, readCSV } from '../api/csv.js';
import { authStore } from '../stores/auth.js';
import { Query } from 'appwrite';

const router = useRouter();

const woList = ref([]);
const keyword = ref('');
const fileInput = ref(null);
const selectedKeys = ref([]);
const showAdd = ref(false);
const addError = ref('');

const addForm = reactive({
  wo_number: '',
  operator: '',
  items: [{ product_number: '', product_name: '', finish_qty: '' }]
});

const menuItems = computed(() => [
  { label: '新增入库单', onClick: openAdd },
  { label: '详情', onClick: viewSelected, disabled: selectedKeys.value.length !== 1 },
  { label: '删除', onClick: deleteSelected, disabled: selectedKeys.value.length === 0 },
  { label: '导入CSV', onClick: triggerImport },
  { label: '导出CSV', onClick: handleExport, disabled: selectedKeys.value.length === 0 }
]);

function genFinishNo() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `FG${date}${time}${rand}`;
}
function nowStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const woMap = computed(() => {
  const m = {};
  woList.value.forEach(w => { m[w.wo_number] = w; });
  return m;
});

const { currentPage, paginatedItems: paginatedBatches, total, loading, reload } =
  usePagination([], {
    mode: 'server',
    pageSize: PAGE_SIZE,
    fetcher: async ({ page, pageSize }) => {
      const all = [];
      let offset = 0;
      const chunk = 500;
      while (true) {
        const res = await listDocs(CONFIG.TABLES.finish, [
          Query.limit(chunk), Query.offset(offset)
        ]);
        all.push(...res.documents);
        if (res.documents.length < chunk) break;
        offset += chunk;
      }

      const batchMap = {};
      all.forEach(d => {
        const key = d.finish_no
          ? `NO:${d.finish_no}`
          : `FB:${d.wo_number}|${d.operator || ''}|${d.finished_at || ''}`;
        if (!batchMap[key]) {
          batchMap[key] = {
            key,
            finish_no: d.finish_no || '',
            wo_number: d.wo_number,
            operator: d.operator,
            finished_at: d.finished_at,
            itemCount: 0,
            totalQty: 0,
          };
        }
        batchMap[key].itemCount++;
        batchMap[key].totalQty += Number(d.finish_qty) || 0;
      });

      const kw = keyword.value.trim().toLowerCase();
      let batches = Object.values(batchMap);
      if (kw) {
        batches = batches.filter(b =>
          (b.finish_no || '').toLowerCase().includes(kw) ||
          (b.wo_number || '').toLowerCase().includes(kw) ||
          (b.operator || '').toLowerCase().includes(kw)
        );
      }
      batches.sort((a, b) =>
        (b.finished_at || '').localeCompare(a.finished_at || '')
      );

      const totalCount = batches.length;
      const start = (page - 1) * pageSize;
      const pageBatches = batches.slice(start, start + pageSize);

      pageBatches.forEach(b => {
        const w = woMap.value[b.wo_number];
        b.product_number = w?.product_number || '';
        b.product_name = w?.product_name || '';
      });

      return { items: pageBatches, total: totalCount };
    },
  });

watch(keyword, () => { if (currentPage.value !== 1) currentPage.value = 1; else reload(); });

async function loadWos() {
  const res = await listDocs(CONFIG.TABLES.wo, [Query.limit(5000)]);
  woList.value = res.documents;
}

onMounted(async () => {
  await loadWos();
  await reload();
});

const allSelected = computed(() =>
  paginatedBatches.value.length > 0 &&
  paginatedBatches.value.every(b => selectedKeys.value.includes(b.key))
);
const someSelected = computed(() =>
  !allSelected.value &&
  paginatedBatches.value.some(b => selectedKeys.value.includes(b.key))
);
function toggleSelectAll(e) {
  if (e.target.checked) {
    const set = new Set(selectedKeys.value);
    paginatedBatches.value.forEach(b => set.add(b.key));
    selectedKeys.value = Array.from(set);
  } else {
    const keys = new Set(paginatedBatches.value.map(b => b.key));
    selectedKeys.value = selectedKeys.value.filter(k => !keys.has(k));
  }
}

function viewSelected() {
  if (selectedKeys.value.length !== 1) return;
  const b = paginatedBatches.value.find(x => x.key === selectedKeys.value[0]);
  if (!b) return;
  if (!b.finish_no) { alert('该入库单没有单号（老数据），无法进入详情。'); return; }
  router.push({ name: 'finish-detail', params: { finishNo: b.finish_no } });
}

function onWoChange() {
  const w = woMap.value[addForm.wo_number];
  if (!w) return;
  if (addForm.items.length === 1) {
    addForm.items[0].product_number = w.product_number || '';
    addForm.items[0].product_name = w.product_name || '';
  }
}

function openAdd() {
  addForm.wo_number = '';
  addForm.operator = authStore.user?.name || authStore.user?.email || '';
  addForm.items = [{ product_number: '', product_name: '', finish_qty: '' }];
  addError.value = '';
  showAdd.value = true;
}
function addRow() { addForm.items.push({ product_number: '', product_name: '', finish_qty: '' }); }
function removeRow(i) {
  if (addForm.items.length <= 1) return;
  addForm.items.splice(i, 1);
}

async function maybeCloseWo(woNumber) {
  const w = woMap.value[woNumber];
  if (!w || w.status === 'completed') return;
  const res = await listDocs(CONFIG.TABLES.finish, [
    Query.equal('wo_number', woNumber), Query.limit(10000)
  ]);
  const totalQty = res.documents.reduce((s, d) => s + (Number(d.finish_qty) || 0), 0);
  if (totalQty >= Number(w.plan_qty || 0)) {
    await updateDoc(CONFIG.TABLES.wo, w.$id, { status: 'completed' });
  }
}

async function saveAdd() {
  if (!addForm.wo_number) { addError.value = '请选择工单'; return; }
  const valid = addForm.items.filter(r =>
    r.product_number && r.finish_qty && Number(r.finish_qty) > 0
  );
  if (!valid.length) { addError.value = '至少填写一条有效成品'; return; }

  const finishNo = genFinishNo();
  const timeStr = nowStr();
  const operator = addForm.operator.trim();

  let ok = 0, fail = 0;
  for (const r of valid) {
    try {
      await createDoc(CONFIG.TABLES.finish, {
        finish_no: finishNo,
        wo_number: addForm.wo_number,
        product_number: String(r.product_number).trim(),
        product_name: String(r.product_name || '').trim(),
        finish_qty: Number(r.finish_qty),
        operator,
        finished_at: timeStr
      });
      ok++;
    } catch (e) { console.error(e); fail++; }
  }

  if (fail > 0) {
    addError.value = `部分失败：成功 ${ok} 条，失败 ${fail} 条`;
    await reload();
    return;
  }
  try { await maybeCloseWo(addForm.wo_number); } catch (e) {}
  showAdd.value = false;
  await reload();
}

function triggerImport() { fileInput.value.click(); }

async function handleImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);

  const required = ['wo_number', 'product_number', 'product_name', 'finish_qty'];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    alert('CSV 缺少必需列：' + missing.join(', ') + '\n正确模板：wo_number,product_number,product_name,finish_qty');
    e.target.value = '';
    return;
  }

  const operator = authStore.user?.name || authStore.user?.email || '';
  const timeStr = nowStr();

  const parsed = [];
  const woNoMap = {};
  const errors = [];
  const touchedWos = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const data = {};
    headers.forEach((h, idx) => {
      const v = row[idx];
      if (v === undefined || v === null || v === '') return;
      if (h === 'finish_qty') {
        const n = Number(v); if (isNaN(n)) return;
        data[h] = n;
      } else data[h] = String(v).trim();
    });

    if (!data.wo_number || !data.product_number) {
      errors.push(`第 ${i+2} 行：工单号或成品料号为空`); continue;
    }
    if (!data.finish_qty || data.finish_qty <= 0) {
      errors.push(`第 ${i+2} 行：入库数量不合法`); continue;
    }
    if (!woMap.value[data.wo_number]) {
      errors.push(`第 ${i+2} 行：工单号 ${data.wo_number} 不存在`); continue;
    }

    if (!woNoMap[data.wo_number]) woNoMap[data.wo_number] = genFinishNo();
    data.finish_no = woNoMap[data.wo_number];
    touchedWos.add(data.wo_number);
    parsed.push({ rowIndex: i + 2, data });
  }

  if (errors.length && !parsed.length) {
    alert('导入失败，全部不合法：\n' + errors.slice(0, 15).join('\n'));
    e.target.value = '';
    return;
  }

  let ok = 0, fail = 0;
  for (const p of parsed) {
    try {
      await createDoc(CONFIG.TABLES.finish, {
        finish_no: p.data.finish_no,
        wo_number: p.data.wo_number,
        product_number: p.data.product_number,
        product_name: p.data.product_name || '',
        finish_qty: p.data.finish_qty,
        operator,
        finished_at: timeStr
      });
      ok++;
    } catch (err) {
      errors.push(`第 ${p.rowIndex} 行：${err.message}`); fail++;
    }
  }

  for (const woNum of touchedWos) {
    try { await maybeCloseWo(woNum); } catch (e) {}
  }

  let msg = `导入完成：成功 ${ok} 条，失败 ${fail} 条。\n共生成 ${Object.keys(woNoMap).length} 张入库单。`;
  if (errors.length) {
    msg += '\n\n失败明细（前 10 条）：\n' + errors.slice(0, 10).join('\n');
    if (errors.length > 10) msg += `\n...还有 ${errors.length - 10} 条`;
  }
  alert(msg);

  await reload();
  e.target.value = '';
}

async function deleteSelected() {
  if (!selectedKeys.value.length) return;
  const targets = paginatedBatches.value.filter(b => selectedKeys.value.includes(b.key));
  const ok = window.$confirm
    ? await window.$confirm({
        title: '删除确认',
        message: `将删除已勾选的 ${targets.length} 张入库单，共 ${targets.reduce((s, b) => s + (b.itemCount || 0), 0)} 条明细。确认？`
      })
    : confirm(`将删除 ${targets.length} 张入库单，确认？`);
  if (!ok) return;

  let ok2 = 0, fail = 0;
  for (const b of targets) {
    try {
      const res = await listDocs(CONFIG.TABLES.finish, [
        Query.equal('finish_no', b.finish_no), Query.limit(5000)
      ]);
      for (const it of res.documents) await deleteDoc(CONFIG.TABLES.finish, it.$id);

      // 退回工单状态
      const w = woMap.value[b.wo_number];
      if (w && w.status === 'completed') {
        const res2 = await listDocs(CONFIG.TABLES.finish, [
          Query.equal('wo_number', b.wo_number), Query.limit(10000)
        ]);
        const totalQty = res2.documents.reduce((s, d) => s + (Number(d.finish_qty) || 0), 0);
        if (totalQty < Number(w.plan_qty || 0)) {
          await updateDoc(CONFIG.TABLES.wo, w.$id, { status: 'in_progress' });
        }
      }
      ok2++;
    } catch (e) {
      console.error('删除失败', b.finish_no, e); fail++;
    }
  }
  selectedKeys.value = [];
  await reload();
  if (fail > 0) alert(`删除完成：成功 ${ok2} 张，失败 ${fail} 张`);
}

async function handleExport() {
  if (!selectedKeys.value.length) { alert('请先勾选要导出的入库单'); return; }
  const selectedBatches = paginatedBatches.value.filter(b => selectedKeys.value.includes(b.key));
  const allItems = [];
  for (const b of selectedBatches) {
    const res = await listDocs(CONFIG.TABLES.finish, [
      Query.equal('finish_no', b.finish_no), Query.limit(5000)
    ]);
    allItems.push(...res.documents);
  }
  const headers = ['finish_no', 'wo_number', 'product_number', 'product_name', 'finish_qty', 'operator', 'finished_at'];
  const rows = allItems.map(d => headers.map(h => d[h] ?? ''));
  exportCSV(headers, rows, 'finish_selected');
}
</script>
