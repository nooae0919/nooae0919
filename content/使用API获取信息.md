Title: 使用API获取信息
Date: 2026-8-5
Category: Python
Tags: requests
Slug: 1d44dff8

<!-- 以下是正文，使用 Markdown 语法 -->
```
import requests
import json

BASE_URL = ""
X_USER = ""

# 1. 获取API Token
token_resp = requests.get(f"{BASE_URL}/resources/api-skill/getApiToken",headers={"X-User-Token": X_USER})
token_data = token_resp.json()
raw_token = token_data.get('data', '')
api_token = raw_token[7:] if raw_token.startswith('Bearer ') else raw_token

# 2. 使用Token请求数据
data_resp = requests.get(f"{BASE_URL}/resources/api/access/8aj7ZKm01c",headers={"Authorization": f"Bearer {api_token}"})

# 3. 解析并显示前10行
data = data_resp.json()
items = data if isinstance(data, list) else data.get('data', [])
for i, item in enumerate(items[:10], 1):
    print(f"{i}. {json.dumps(item, ensure_ascii=False)}")
```


