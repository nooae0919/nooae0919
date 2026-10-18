<template>
  <div id="login-view">
    <div class="login-card">
      <h1>SMT 线边仓管理系统</h1>
      <p>请登录</p>
      <input v-model="email" type="email" placeholder="邮箱" autocomplete="username">
      <input v-model="password" type="password" placeholder="密码"
             autocomplete="current-password" @keyup.enter="handleLogin">
      <button id="login-btn" @click="handleLogin">登录</button>
      <p class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { login } from '../stores/auth.js';

const router = useRouter();
const route = useRoute();
const email = ref('');
const password = ref('');
const error = ref('');

async function handleLogin() {
  if (!email.value.trim() || !password.value) {
    error.value = '请输入邮箱和密码';
    return;
  }
  error.value = '';
  try {
    await login(email.value.trim(), password.value);
    const redirect = route.query.redirect || '/wo';
    router.replace(redirect);
  } catch (e) {
    error.value = '登录失败：' + (e.message || '邮箱或密码错误');
  }
}
</script>
