const { Client, Account } = Appwrite;

const client = new Client()
  .setEndpoint(CONFIG.APPWRITE_ENDPOINT)
  .setProject(CONFIG.PROJECT_ID);

const account = new Account(client);
window.AppwriteClient = client;

const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const loginError = document.getElementById('login-error');

// 判断当前是不是登录页
function isLoginPage() {
  return !!document.getElementById('login-email');
}

async function initAuth() {
  try {
    const user = await account.get();
    // 已登录状态，访问登录页 → 直接跳转
    window.location.href = 'wo.html';
  } catch {
    // 未登录 → 显示登录层
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

// 登录页：登录按钮
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
      // 登录成功 → 跳转到工单管理
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

// 其它页面：检查登录状态
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

// 页面初始化
if (isLoginPage()) {
  initAuth();
} else if (document.getElementById('app-view')) {
  checkAuth();
}
