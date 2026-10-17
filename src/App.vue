<template>
  <RouterView />
</template>

<script setup>
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';
import { initAuth, authStore } from './stores/auth.js';
import { getPartMap } from './api/partMap.js';
import router from './router/index.js';

onMounted(async () => {
  await initAuth();
  try { await getPartMap(); } catch (e) { console.warn('主数据预热失败', e); }
  if (!router.currentRoute.value.meta.public) {
    await router.replace(router.currentRoute.value.fullPath);
  }
});
</script>
