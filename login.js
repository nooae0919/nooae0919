const { Client, Account } = Appwrite;

const client = new Client()
  .setEndpoint(CONFIG.APPWRITE_ENDPOINT)
  .setProject(CONFIG.PROJECT_ID);

const account = new Account(client);
window.AppwriteClient = client;

const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const loginError = document.getElementById('login-error');

async function initAuth() {
  try {
    const user = await account.get();
    await onLoggedIn(user);
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

// 登录按钮（仅登录页有）
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
      const user = await account.get();
      await onLoggedIn(user);
      window.location.href = 'wo.html';
    } catch (e) {
      loginError.textContent = '登录失败：' + (e.message || '邮箱或密码错误');
    }
  };
}

// 退出按钮
const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await account.deleteSession('current');
    window.location.href = 'index.html';
  };
}

// 非登录页检查登录状态
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

// 根据页面情况初始化
if (loginView && document.getElementById('login-email')) {
  initAuth();
} else {
  checkAuth();
}