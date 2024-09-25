title: 站位表制作
author: Nooae
tags:
  - excel
categories: []
date: 2024-07-20 20:51:00
---
~~~
=IF(ISNUMBER(VALUE(LEFT(INDIRECT("C"&ROW()),1))),LEFT(INDIRECT("C"&ROW()),1),INDIRECT("A"&ROW()-1))
~~~
判断C列内容左边第1个字符是否为数字；如果是，显示该数字；否则显示A列上一单元格内容。