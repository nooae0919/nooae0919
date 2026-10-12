<template>
  <MainLayout>
    <div class="toolbar">
      <button @click="openAdd">新增领料单</button>
      <button @click="triggerImport">导入CSV</button>
      <input type="file" accept=".csv" hidden ref="fileInput" @change="handleImport">
    </div>

    <div class="search-bar">
      <input v-model="keyword" type="text" placeholder="按领料单号 / 工单号 / 领料人搜索...">
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:60px;">序号</th>
          <th>领料单号</th>
          <th>工单号</th>
          <th>成品料号</th>
          <th>成品名称</th>
          <th>物料种类</th>
          <th>领料总数</th>
          <th>领料人</th>
          <th>领料时间</th>
          <th style="width:160px;">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(b, idx) in filteredBatches" :key="b.key">
          <td>{{ idx + 1 }}</td>
          <td>
            <a class="part-link" href="#" @click.prevent="goDetail(b)">
              {{ b.issue_no || '(无单号)' }}
            </a>
          </td>
          <td>{{ b.wo_number || '' }}</td>
          <td>{{ b.product_number || '' }}</td>
          <td>{{ b.product_name || '' }}</td>
          <td>{{ b.items.length }} 种</td>
          <td><b>{{ b.totalQty }}</b></td>
          <td>{{ b.operator || '' }}</td>
          <td>{{ b.issue_time || '' }}</td>
          <td>
            <button @click="goDetail(b)">详情</button>
            <button @click="deleteBatch(b)">删除</button>
          </td>
        </tr>
        <tr v-if="!filteredBatches.length">
          <td colspan="10" style="text-align:center;color:#999;">暂无领料单</td>
        </tr>
      </tbody>
    </table>

    <!-- 新增领料单弹窗 -->
    <div v-if="showAdd" class="modal-mask">
      <div class="modal-box" style="width:760px;max-width:94vw;">
        <h3>新增领料单</h3>

        <label>工单
          <select v-model="addForm.wo_number">
            <option value="">— 请选择工单 —</option>
            <option v-for="w in woList" :key="w.$id" :value="w.wo_number">
              {{ w.wo_number }} / {{ w.product_number }} / {{ w.product_name }}
            </option>
          </select>
        </label>

        <label>领料人
          <input v-model="addForm.operator" type="text" placeholder="默认当前登录用户">
        </label>

        <div style="margin-top:8px;margin-bottom:8px;font-size:13px;color:#555;display:flex;justify-content:space-between;align-items:center;">
          <span>物料明细</span>
          <button class="btn-cancel" style="padding:4px 10px;" @click="addRow">+ 加一行</button>
        </div>

        <table style="margin-bottom:12px;">
          <thead>
            <tr>
              <th style="width:50px;">#</th>
              <th>物料料号</th>
              <th>物料名称</th>
              <th style="width:120px;">数量</th>
              <th style="width:80px;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in addForm.items" :key="i">
              <td>{{ i + 1 }}</td>
              <td><input v-model="r.part_number" type="text" placeholder="如 M-2001" style="margin:0;"></td>
              <td><input v-model="r.part_name" type="text" placeholder="如 贴片电阻" style="margin:0;"></td>
              <td><input v-model.number="r.issue_qty" type="number" placeholder="数量" style="margin:0;"></td>
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
import { ref, onMounted, computed, reactive } from 'vue';
import { useRouter } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import { CONFIG } from '../config.js';
import { listDocs, createDoc, deleteDoc } from '../api/db.js';
import { readCSV } from '../api/csv.js';
import { authStore } from '../stores/auth.js';
import { Query } from 'appwrite';

const router = useRouter();

const allIssues = ref([]);
const woList = ref([]);
const keyword = ref('');
const fileInput = ref(null);
const showAdd = ref(false);
const addError = ref('');

const addForm = reactive({
  wo_number: '',
  operator: '',
  items: [{ part_number: '', part_name: '', issue_qty: '' }]
});

/** 生成领料单号 */
function genIssueNo() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `IS${date}${time}${rand}`;
}

/** 当前时间字符串 */
function nowStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 工单号 -> 工单信息 */
const woMap = computed(() => {
  const m = {};
  woList.value.forEach(w => { m[w.wo_number] = w; });
  return m;
});

/** 把 issue 明细按 issue_no 聚合（老数据按 工单+人+时间 兜底） */
const batches = computed(() => {
  const map = {};
  allIssues.value.forEach(d => {
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
  // 补成品料号 / 名称
  Object.values(map).forEach(b => {
    const w = woMap.value[b.wo_number];
    b.product_number = w?.product_number || '';
    b.product_name = w?.product_name || '';
  });
  return Object.values(map).sort((a, b) =>
    (b.issue_time || '').localeCompare(a.issue_time || '')
  );
});

const filteredBatches = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return batches.value;
  return batches.value.filter(b =>
    (b.issue_no || '').toLowerCase().includes(kw) ||
    (b.wo_number || '').toLowerCase().includes(kw) ||
    (b.operator || '').toLowerCase().includes(kw)
  );
});

async function loadAll() {
  const [issueRes, woRes] = await Promise.all([
    listDocs(CONFIG.TABLES.issue, [Query.limit(10000)]),
    listDocs(CONFIG.TABLES.wo, [Query.limit(5000)])
  ]);
  allIssues.value = issueRes.documents;
  woList.value = woRes.documents;
}

onMounted(loadAll);

function goDetail(b) {
  if (!b.issue_no) {
    alert('该领料单没有单号（老数据），无法进入详情。');
    return;
  }
  router.push({ name: 'issue-detail', params: { issueNo: b.issue_no } });
}

/* ============ 新增 ============ */
function openAdd() {
  addForm.wo_number = '';
  addForm.operator = authStore.user?.name || authStore.user?.email || '';
  addForm.items = [{ part_number: '', part_name: '', issue_qty: '' }];
  addError.value = '';
  showAdd.value = true;
}
function addRow() {
  addForm.items.push({ part_number: '', part_name: '', issue_qty: '' });
}
function removeRow(i) {
  if (addForm.items.length <= 1) return;
  addForm.items.splice(i, 1);
}

async function saveAdd() {
  if (!addForm.wo_number) { addError.value = '请选择工单'; return; }
  const valid = addForm.items.filter(r =>
    r.part_number && r.issue_qty && Number(r.issue_qty) > 0
  );
  if (!valid.length) { addError.value = '至少填写一条有效物料'; return; }

  const issueNo = genIssueNo();
  const timeStr = nowStr();
  const operator = addForm.operator.trim();

  let ok = 0, fail = 0;
  for (const r of valid) {
    try {
      await createDoc(CONFIG.TABLES.issue, {
        issue_no: issueNo,
        wo_number: addForm.wo_number,
        part_number: String(r.part_number).trim(),
        part_name: String(r.part_name || '').trim(),
        issue_qty: Number(r.issue_qty),
        operator,
        issue_time: timeStr
      });
      ok++;
    } catch (e) {
      console.error('新增失败', r, e.message);
      fail++;
    }
  }

  if (fail > 0) {
    addError.value = `部分失败：成功 ${ok} 条，失败 ${fail} 条`;
    await loadAll();
    return;
  }
  showAdd.value = false;
  await loadAll();
}

/* ============ 导入 CSV ============ */
function triggerImport() { fileInput.value.click(); }

async function handleImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const { headers, rows } = await readCSV(f);

  // 模板：工单号、物料料号、物料名称、物料数量
  const required = ['wo_number', 'part_number', 'part_name', 'issue_qty'];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    alert('CSV 缺少必需列：' + missing.join(', ') + '\n正确模板：wo_number,part_number,part_name,issue_qty');
    e.target.value = '';
    return;
  }

  const operator = authStore.user?.name || authStore.user?.email || '';
  const timeStr = nowStr();

  // 第 1 步：解析所有行，按 wo_number 分组，每组生成一个 issue_no
  const parsed = [];
  const woNoMap = {};      // wo_number -> issue_no
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

    if (!data.wo_number || !data.part_number) {
      errors.push(`第 ${i+2} 行：工单号或物料料号为空`);
      continue;
    }
    if (!data.issue_qty || data.issue_qty <= 0) {
      errors.push(`第 ${i+2} 行：物料数量不合法`);
      continue;
    }
    // 工单必须存在
    if (!woMap.value[data.wo_number]) {
      errors.push(`第 ${i+2} 行：工单号 ${data.wo_number} 不存在`);
      continue;
    }

    if (!woNoMap[data.wo_number]) {
      woNoMap[data.wo_number] = genIssueNo();
    }
    data.issue_no = woNoMap[data.wo_number];
    parsed.push({ rowIndex: i + 2, data });
  }

  if (errors.length && !parsed.length) {
    alert('导入失败，全部不合法：\n' + errors.slice(0, 15).join('\n'));
    e.target.value = '';
    return;
  }

  // 第 2 步：写入
  let ok = 0, fail = 0;
  for (const p of parsed) {
    try {
      await createDoc(CONFIG.TABLES.issue, {
        issue_no: p.data.issue_no,
        wo_number: p.data.wo_number,
        part_number: p.data.part_number,
        part_name: p.data.part_name || '',
        issue_qty: p.data.issue_qty,
        operator,
        issue_time: timeStr
      });
      ok++;
    } catch (err) {
      errors.push(`第 ${p.rowIndex} 行：${err.message}`);
      fail++;
    }
  }

  let msg = `导入完成：成功 ${ok} 条，失败 ${fail} 条。\n共生成 ${Object.keys(woNoMap).length} 张领料单。`;
  if (errors.length) {
    msg += '\n\n失败明细（前 10 条）：\n' + errors.slice(0, 10).join('\n');
    if (errors.length > 10) msg += `\n...还有 ${errors.length - 10} 条`;
  }
  alert(msg);

  await loadAll();
  e.target.value = '';
}

/* ============ 删除整张领料单 ============ */
async function deleteBatch(b) {
  const ok = window.$confirm
    ? await window.$confirm({
        title: '删除确认',
        message: `确认删除领料单 ${b.issue_no || '(无单号)'}？共 ${b.items.length} 条明细。`
      })
    : confirm(`确认删除领料单？共 ${b.items.length} 条明细。`);
  if (!ok) return;

  try {
    for (const it of b.items) {
      await deleteDoc(CONFIG.TABLES.issue, it.$id);
    }
    await loadAll();
  } catch (e) {
    alert('删除失败：' + e.message);
  }
}
</script>
