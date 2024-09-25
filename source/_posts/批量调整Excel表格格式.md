title: 批量调整Excel表格格式
author: Nooae
tags:
  - python
categories: []
date: 2024-04-21 17:18:00
---
~~~
import openpyxl
import os

def excel_col(file_name):
    wb = openpyxl.load_workbook(file_name)
    sheet = wb.active

    for row in sheet.iter_rows():
        for cell in row:
            cell.font=openpyxl.styles.Font(name='宋体')
            cell.font=openpyxl.styles.Font(name='Times New Roman',size=12)
            
    sheet.column_dimensions['B'].width = 6
    sheet.column_dimensions['C'].width = 18
    sheet.column_dimensions['D'].width = 25

    sheet['A1'].font=openpyxl.styles.Font(name='宋体',size=20,bold=True)
    sheet['G1'].font=openpyxl.styles.Font(name='宋体',size=12,bold=True)
    sheet['G2'].font=openpyxl.styles.Font(name='宋体',size=12,bold=True)

    wb.save(file_name)

def excel_file():
    path = os.getcwd()
    files = os.listdir(path)
    excelfiles = [f for f in files if not f.startswith(("~$")) and f.endswith((".xlsx"))]
    for file in excelfiles:
        fullpath = os.path.join(path,file)
        excel_col(fullpath)
        print(fullpath + "格式调整完成")

excel_file()
~~~