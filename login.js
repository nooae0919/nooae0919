const { Client, Account, OAuthProvider } = Appwrite;

const client = new Client()
  .setEndpoint(CONFIG.APPWRITE_ENDPOINT)
  .setProject(CONFIG.PROJECT_ID);

const account = new Account(client);

// 暴露给 app.js 使用
window.AppwriteClient = client;

const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const loginError = document.getElementById('login-error');

async function initAuth() {
  const params = new URLSearchParams(location.search);
  if (params.get('error')) {
    loginError.textContent = 'GitHub 登录失败，请重试。';
    history.replaceState({}, '', location.pathname);
  }

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
  // 白名单校验（前端拦截，真正权限靠 Appwrite Role）
  const githubName = user.name || user.email;
  const allowed = CONFIG.ALLOWED_GITHUB_USERS;

  if (allowed.length && !allowed.includes(githubName)) {
    await account.deleteSession('current');
    loginError.textContent = `账号 ${githubName} 未被授权访问。`;
    showLogin();
    return;
  }

  // 显示主界面
  document.getElementById('user-name').textContent = githubName;
  const avatar = document.getElementById('user-avatar');
  if (user.prefs?.avatar) avatar.src = user.prefs.avatar;

  loginView.classList.add('hidden');
  appView.classList.remove('hidden');

  // 通知 app.js 加载数据
  if (window.onAuthReady) window.onAuthReady();
}

document.getElementById('github-login').onclick = () => {
  account.createOAuth2Session(
    OAuthProvider.Github,
    'https://www.nooae.com/index.html',
    'https://www.nooae.com/index.html'
  );
};

document.getElementById('logout').onclick = async () => {
  await account.deleteSession('current');
  location.reload();
};

initAuth();
