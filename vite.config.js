import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// ⚠️ GitHub Pages 项目站点改成 '/你的仓库名/'；用户主页仓库保持 '/'
export default defineConfig({
  base: '/smt-warehouse/',
  plugins: [vue()],
  server: { port: 5173, open: true }
});
