// vite.config.js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: '/',                     // ⭐ 就一个斜杠
  plugins: [vue()],
  server: { port: 5173, open: true }
});
