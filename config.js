// 所有配置集中在这里，方便统一修改
const CONFIG = {
  APPWRITE_ENDPOINT: 'https://sgp.cloud.appwrite.io/v1',
  PROJECT_ID: '6abd523c001544279ca8',
  DATABASE_ID: 'smt_warehouse',

  TABLES: {
    wo: 'work_orders',
    bom: 'bom_items',
    issue: 'issue_records',
    return: 'return_records'
  },

  // 允许访问的 GitHub 用户名白名单（前端提示用，真正权限在 Appwrite 后台控制）
  ALLOWED_GITHUB_USERS: ['your-github-name', 'teammate-name']
};
