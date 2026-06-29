Title: 实时音乐搜索
URL: music-search.html
Save_as: music-search.html
Date: 2024-01-01

{% extends "base.html" %}

{% block content %}
<article>
    <h1>实时音乐搜索</h1>
    
    <div id="musicSearchApp">
        <!-- 搜索界面代码 -->
        <div class="search-box">
            <input type="text" id="songQuery" placeholder="输入歌曲名称">
            <button onclick="searchSong()">搜索</button>
        </div>
        
        <div id="results"></div>
    </div>
    
    <script>
    // 使用CORS代理来绕过跨域限制
    const proxyUrl = 'https://api.codetabs.com/v1/proxy?quest=';
    
    async function searchSong() {
        const query = document.getElementById('songQuery').value;
        if (!query) return;
        
        const url = `https://pinkamuz.pro/search/${encodeURIComponent(query)}`;
        
        try {
            const response = await fetch(proxyUrl + url);
            const html = await response.text();
            
            // 解析HTML（这里简化了，实际需要更复杂的解析）
            const results = parseResults(html);
            displayResults(results);
            
        } catch (error) {
            console.error('搜索失败:', error);
            document.getElementById('results').innerHTML = 
                '<p style="color:red;">搜索失败，请稍后重试</p>';
        }
    }
    
    function parseResults(html) {
        // 这里需要根据实际网站结构编写解析逻辑
        // 可以使用DOMParser或正则表达式
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 示例解析逻辑（需要根据目标网站调整）
        const items = [];
        const elements = doc.querySelectorAll('.artist.__adv_artist');
        
        elements.forEach(el => {
            // 提取信息...
        });
        
        return items;
    }
    
    function displayResults(results) {
        // 显示结果...
    }
    </script>
    
    <style>
    .search-box {
        margin: 20px 0;
        padding: 20px;
        background: #f5f5f5;
        border-radius: 8px;
    }
    
    .search-box input {
        padding: 10px;
        width: 300px;
        margin-right: 10px;
    }
    
    .search-box button {
        padding: 10px 20px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }
    </style>
</article>
{% endblock %}