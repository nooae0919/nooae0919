<template>
  <div v-if="total > 0 || loading" class="pagination">
    <span class="pagination-summary">
      <template v-if="loading">加载中...</template>
      <template v-else>
        显示 {{ start }}–{{ end }} 条，共 {{ total }} 条（每页 {{ PAGE_SIZE }} 条）
      </template>
    </span>
    <div class="pagination-controls">
      <button :disabled="loading || page <= 1" @click="changePage(page - 1)">上一页</button>
      <span>第 {{ page }} / {{ pageCount }} 页</span>
      <button :disabled="loading || page >= pageCount" @click="changePage(page + 1)">下一页</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { PAGE_SIZE } from '../composables/usePagination.js';

const props = defineProps({
  page: { type: Number, required: true },
  total: { type: Number, required: true },
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(['update:page']);

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / PAGE_SIZE)));
const start = computed(() => (props.page - 1) * PAGE_SIZE + 1);
const end = computed(() => Math.min(props.page * PAGE_SIZE, props.total));

function changePage(page) {
  if (page >= 1 && page <= pageCount.value) emit('update:page', page);
}
</script>
