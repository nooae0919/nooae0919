import { computed, ref, watch } from 'vue';

export const PAGE_SIZE = 25;

export function usePagination(items) {
  const currentPage = ref(1);
  const paginatedItems = computed(() => {
    const start = (currentPage.value - 1) * PAGE_SIZE;
    return items.value.slice(start, start + PAGE_SIZE);
  });

  watch(items, () => {
    currentPage.value = 1;
  });

  return { currentPage, paginatedItems };
}
