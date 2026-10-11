<template>
  <RouterView />
</template>

<script setup>
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';
import { initAuth, authStore } from './stores/auth.js';
import router from './router/index.js';

onMounted(async () => {
  await initAuth();
  // 登录态恢复后，重新触发当前路由的守卫判断
  if (!router.currentRoute.value.meta.public) {
    await router.replace(router.currentRoute.value.fullPath);
  }
});
</script>
