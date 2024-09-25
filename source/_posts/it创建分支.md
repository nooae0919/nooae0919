title: git创建分支
author: Nooae
tags:
  - python
categories: []
date: 2024-09-25 17:13:00
---
1、打开博客目录，目录下有一个“.gitignore”文件，没有就自己创建一个，该文件用于忽略指定的文件不进行同步，根据你的要求进行配置。我的配置内容如下：
~~~
.DS_Store
Thumbs.db
db.json
*.log
node_modules/
public/
.deploy*/
~~~
2、右键打开“git”，依次输入以下命令进行本地仓库与远程仓库对接：
~~~
# 初始化本地仓库
git init

# 本地仓库和GitHub远程仓库对接
# nineya/blog_source.git修改为博客界面所在仓库名
git remote add origin git@github.com:nineya/nineya.github.io.git

# 查看远程仓库地址，验证配置是否正确
git remote -v

# 新建分支blog_source
git branch blog_source

# 切换到blog_source分支
git checkout blog_source
~~~
3、提交数据到远程仓库：
~~~
# 同步远程库上的数据，否则无法提交
git pull

# 将所有文件添加到本地仓库
git add -A

# 提交到远程仓库
git commit -m "博客源文件"
git push
~~~