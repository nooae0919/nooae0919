title: win32打印工作表
author: Nooae
tags:
  - python
categories: []
date: 2023-10-27 21:57:00
---
~~~
import win32com.client as win32

excel = win32.gencache.EnsureDispatch('Excel.Application')

wb = excel.Workbooks.Open(r'C:\123.xlsx')
ws = wb.Sheets('Sheet1') 

ws.PrintOut()

wb.Close(False)
excel.Quit()
~~~