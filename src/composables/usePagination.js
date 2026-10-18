import { computed, ref, watch } from 'vue';

export const PAGE_SIZE = 25;

export function usePagination(source, options = {}) {
  const mode = options.mode || 'client';
  const pageSize = options.pageSize || PAGE_SIZE;
  const fetcher = options.fetcher;

  const currentPage = ref(1);

  const isRefLike = source && typeof source === 'object' && 'value' in source;

  const clientItems = computed(() => {
    if (mode !== 'client' || !isRefLike) return [];
    const list = source.value || [];
    const start = (currentPage.value - 1) * pageSize;
    return list.slice(start, start + pageSize);
  });

  const clientTotal = computed(() => {
    if (mode !== 'client' || !isRefLike) return 0;
    return (source.value || []).length;
  });

  if (mode === 'client' && isRefLike) {
    watch(source, () => { currentPage.value = 1; });
  }

  const serverItems = ref([]);
  const serverTotal = ref(0);
  const loading = ref(false);
  const error = ref(null);

  async function reload() {
    if (mode !== 'server' || typeof fetcher !== 'function') return;
    loading.value = true;
    error.value = null;
    try {
      const res = await fetcher({ page: currentPage.value, pageSize });
      if (Array.isArray(res)) {
        serverItems.value = res;
        serverTotal.value = res.length;
      } else {
        serverItems.value = res.items || [];
        serverTotal.value = res.total ?? serverItems.value.length;
      }
    } catch (e) {
      error.value = e;
      serverItems.value = [];
      serverTotal.value = 0;
      console.error('[usePagination] fetch failed:', e);
    } finally {
      loading.value = false;
    }
  }

  if (mode === 'server') {
    watch(currentPage, () => { reload(); });
  }

  const paginatedItems = computed(() =>
    mode === 'server' ? serverItems.value : clientItems.value
  );

  const total = computed(() =>
    mode === 'server' ? serverTotal.value : clientTotal.value
  );

  watch(total, (t) => {
    const maxPage = Math.max(1, Math.ceil(t / pageSize));
    if (currentPage.value > maxPage) {
      currentPage.value = maxPage;
    }
  });

  return { currentPage, paginatedItems, total, pageSize, loading, error, reload };
}
