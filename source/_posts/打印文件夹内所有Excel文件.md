title: 打印文件夹内所有Excel文件
author: Nooae
tags:
  - python
categories: []
date: 2024-01-24 19:07:00
---
```
import os
import win32com.client as win32

def init_excel(print_file):
    excel = win32.gencache.EnsureDispatch('Excel.Application')
    wb = excel.Workbooks.Open(print_file)
    ws = wb.Sheets('Sheet1')
    ws.PrintOut()
    wb.Close(False)
    excel.Quit()

def excel_file():
    path = os.getcwd()
    files = os.listdir(path)
    excelfiles = [f for f in files if not f.startswith(("~$")) and f.endswith((".xlsx"))]
    for file in excelfiles:
        fullpath = os.path.join(path,file)
        print(fullpath)
        init_excel(fullpath)

excel_file()
```