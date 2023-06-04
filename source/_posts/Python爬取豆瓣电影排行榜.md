title: Python爬取豆瓣电影排行榜
tags: python
date: 2023-03-27 20:14:23
---
import requests
import re

#1-爬取数据<!--more-->
url = 'https://movie.douban.com/chart'
headers = {'User-Agent':'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36'}
response = requests.get(url,headers = headers)
#print(response.text)
html_str = response.text

#2-解析数据
patten = re.compile('< a.*?nbg.*?title="(.*?)">',re.S)
items = re.findall(patten,html_str)
print(items)

#3-存储数据
with open('douban.txt',"w",encoding='utf-8') as f:
+ for item in items:
	- f.write(item+'\n')