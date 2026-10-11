import { createRouter, createWebHashHistory } from 'vue-router';
import { authStore } from '../stores/auth.js';

const routes = [
  { path: '/', redirect: '/wo' },
  { path: '/login', name: 'login', component: () => import('../views/Login.vue'), meta: { public: true } },
  { path: '/wo', name: 'wo', component: () => import('../views/WoList.vue') },
  { path: '/issue', name: 'issue', component: () => import('../views/IssueList.vue') },
  { path: '/issue/:wo', name: 'issue-detail', component: () => import('../views/IssueDetail.vue'), props: true },
  { path: '/return', name: 'return', component: () => import('../views/ReturnList.vue') },
  { path: '/return/:wo', name: 'return-detail', component: () => import('../views/ReturnDetail.vue'), props: true },
  { path: '/finish', name: 'finish', component: () => import('../views/FinishList.vue') },
  { path: '/finish/:wo', name: 'finish-detail', component: () => import('../views/FinishDetail.vue'), props: true },
  { path: '/inventory', name: 'inventory', component: () => import('../views/InventoryList.vue') },
  { path: '/inventory-summary', name: 'inventory-summary', component: () => import('../views/InventorySummary.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/wo' },
  { path: '/bom', name: 'bom', component: () => import('../views/BomList.vue') },
  { path: '/bom/:id', name: 'bom-detail', component: () => import('../views/BomDetail.vue'), props: true },
];

const router = createRouter({
  history: createWebHashHistory(),  // ⭐ GitHub Pages 免配置
  routes
});

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (authStore.user) return true;
  if (!authStore.ready) return false;    // 等 initAuth 完成
  return { name: 'login', query: { redirect: to.fullPath } };
});

export default router;
