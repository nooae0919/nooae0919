title: 双for打印九九乘法表
author: Nooae
tags: []
categories: []
date: 2023-04-16 21:52:00
---
for i in range(1, 10):
+ for j in range(1, i + 1):
	- print(f'{i}*{j}={i * j}', end='\t')
+ print()