---
title: 双for打印九九乘法表
date: 2023-04-16 20:14:23
tags: python
---
for i in range(1, 10):
+ for j in range(1, i + 1):
	- print('{}\*{}={}'.format(i,j,i\*j), end='\t')
+ print()