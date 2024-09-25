title: Selenium模拟点击
author: Nooae
tags:
  - python
categories: []
date: 2024-06-08 21:13:00
---
~~~
from selenium import webdriver
from selenium.webdriver.common.by import By
import time

driver = webdriver.Chrome()  # 打开谷歌浏览器
url = 'https://www.baidu.com/'
driver.get(url)  # 输入网址
 
# 输入搜索关键词并点击搜索按钮
v = driver.find_element(By.ID, 'kw')  # 查找搜索输入框
v.send_keys('不想搬砖怎么办？')  # 输入关键词
time.sleep(3)  # 等待页面加载完成

btn = driver.find_element(By.ID, 'su')  # 查找搜索按钮
btn.click()  # 点击搜索按钮

time.sleep(60)  # 等待搜索结果页面加载完成

driver.quit()  # 关闭浏览器
~~~