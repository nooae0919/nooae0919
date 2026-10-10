const { Client, Account, ID } = Appwrite;

const client = new Client()
  .setEndpoint(CONFIG.APPWRITE_ENDPOINT)
  .setProject(CONFIG.PROJECT_ID);

const account = new Account(client);
window.AppwriteClient = client;
window.ID = ID;

const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const loginError = document.getElementById('login-error');

function isLoginPage() {
  return !!document.getElementById('login-email');
}

async function initAuth() {
  try {
    await account.get();
    window.location.href = 'wo.html';
  } catch {
    showLogin();
  }
}

function showLogin() {
  if (loginView) loginView.classList.remove('hidden');
  if (appView) appView.classList.add('hidden');
}

async function onLoggedIn(user) {
  const userNameEl = document.getElementById('user-name');
  if (userNameEl) userNameEl.textContent = user.name || user.email;
  if (loginView) loginView.classList.add('hidden');
  if (appView) appView.classList.remove('hidden');
  if (window.onAuthReady) window.onAuthReady();
}

const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
  loginBtn.onclick = async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) {
      loginError.textContent = '请输入邮箱和密码';
      return;
    }
    loginError.textContent = '';
    try {
      await account.createEmailPasswordSession(email, password);
      window.location.href = 'wo.html';
    } catch (e) {
      loginError.textContent = '登录失败：' + (e.message || '邮箱或密码错误');
    }
  };
}

const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await account.deleteSession('current');
    window.location.href = 'index.html';
  };
}

async function checkAuth() {
  try {
    const user = await account.get();
    const userNameEl = document.getElementById('user-name');
    if (userNameEl) userNameEl.textContent = user.name || user.email;
    if (loginView) loginView.classList.add('hidden');
    if (appView) appView.classList.remove('hidden');
    if (window.onAuthReady) window.onAuthReady();
  } catch {
    window.location.href = 'index.html';
  }
}

if (isLoginPage()) {
  initAuth();
} else if (document.getElementById('app-view')) {
  checkAuth();
}
