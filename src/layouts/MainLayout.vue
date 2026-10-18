<template>
  <div id="app-view">
    <header>
      <h1>SMT 线边仓管理系统</h1>
      <div class="user-info">
        <span>{{ authStore.user?.name || authStore.user?.email }}</span>
        <button @click="handleLogout">退出</button>
      </div>
    </header>

    <nav>
      <RouterLink to="/inventory">库存管理</RouterLink>
      <RouterLink to="/wo">工单管理</RouterLink>
      <RouterLink to="/bom">BOM管理</RouterLink>
      <RouterLink to="/part">物料主数据</RouterLink>
      <RouterLink to="/issue">生产领料</RouterLink>
      <RouterLink to="/return">生产退料</RouterLink>
      <RouterLink to="/finish">成品入库</RouterLink>
    </nav>

    <main>
      <slot />
    </main>
  </div>
</template>

<script setup>
import { RouterLink, useRouter } from 'vue-router';
import { authStore, logout } from '../stores/auth.js';

const router = useRouter();

async function handleLogout() {
  await logout();
  router.push({ name: 'login' });
}
</script>
