import { createRouter, createWebHashHistory } from 'vue-router';
import { authStore } from '../stores/auth.js';

const routes = [
  { path: '/', redirect: '/wo' },
  { path: '/login', name: 'login', component: () => import('../views/Login.vue'), meta: { public: true } },
  { path: '/wo', name: 'wo', component: () => import('../views/WoList.vue') },
  { path: '/issue', name: 'issue', component: () => import('../views/IssueList.vue') },
  { path: '/issue/:issueNo', name: 'issue-detail', component: () => import('../views/IssueDetail.vue'), props: true },
  { path: '/return', name: 'return', component: () => import('../views/ReturnList.vue') },
  { path: '/return/:returnNo', name: 'return-detail', component: () => import('../views/ReturnDetail.vue'), props: true },
  { path: '/finish', name: 'finish', component: () => import('../views/FinishList.vue') },
  { path: '/finish/:finishNo', name: 'finish-detail', component: () => import('../views/FinishDetail.vue'), props: true },
  { path: '/inventory', name: 'inventory', component: () => import('../views/InventoryList.vue') },
  { path: '/inventory-summary', name: 'inventory-summary', component: () => import('../views/InventorySummary.vue') },
  { path: '/bom', name: 'bom', component: () => import('../views/BomList.vue') },
  { path: '/bom/:id', name: 'bom-detail', component: () => import('../views/BomDetail.vue'), props: true },
  { path: '/part', name: 'part', component: () => import('../views/PartList.vue') },
  { path: '/wo/:woId/kitting', name: 'wo-kitting', component: () => import('../views/WoKitting.vue'), props: true },
  { path: '/:pathMatch(.*)*', redirect: '/wo' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (authStore.user) return true;
  if (!authStore.ready) return false;
  return { name: 'login', query: { redirect: to.fullPath } };
});

export default router;
