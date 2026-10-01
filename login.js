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
  loginView.classList.remove('hidden');
  appView.classList.add('hidden');
}

async function onLoggedIn(user) {
  document.getElementById('user-name').textContent = user.name || user.email;

  loginView.classList.add('hidden');
  appView.classList.remove('hidden');

  if (window.onAuthReady) window.onAuthReady();
}

document.getElementById('login-btn').onclick = async () => {
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
  } catch (e) {
    loginError.textContent = '登录失败：' + (e.message || '邮箱或密码错误');
  }
};

document.getElementById('logout').onclick = async () => {
  await account.deleteSession('current');
  location.reload();
};

initAuth();
