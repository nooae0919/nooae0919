title: 生成SSH
author: Nooae
tags:
  - python
categories: []
date: 2023-10-22 13:40:00
---
+ 用户名和邮箱进行初始化
git config --global user.name yourname
git config --global user.email youremail
<!--more-->
+ 检查初始化信息
git config user.name
git config user.email

+ 生成密钥
ssh-keygen -t rsa -C youremail

+ 查看公钥
cat ~/.ssh/id_rsa.pub