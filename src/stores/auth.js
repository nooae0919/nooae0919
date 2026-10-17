import { reactive } from 'vue';
import { account } from '../api/client.js';

export const authStore = reactive({
  user: null,
  ready: false
});

export async function initAuth() {
  try {
    authStore.user = await account.get();
  } catch {
    authStore.user = null;
  } finally {
    authStore.ready = true;
  }
}

export async function login(email, password) {
  await account.createEmailPasswordSession(email, password);
  authStore.user = await account.get();
  return authStore.user;
}

export async function logout() {
  await account.deleteSession('current');
  authStore.user = null;
}
