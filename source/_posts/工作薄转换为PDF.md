title: 将工作薄转换为PDF
author: Nooae
tags:
  - python
categories: []
date: 2024-04-30 19:18:00
---
将EXCEL中的所有工作表转换为一个PDF文件
~~~
import win32com.client,os
  
def excel_to_pdf(excel_path, pdf_path):  
    excel = win32com.client.Dispatch("Excel.Application")  
    excel.Visible = False    
    wb = excel.Workbooks.Open(excel_path)  
  
    wb.ExportAsFixedFormat(  
        Type=0,  
        Filename=pdf_path,  
        Quality=win32com.client.constants.xlQualityStandard,  
        IncludeDocProperties=True,  
        IgnorePrintAreas=False,  
        OpenAfterPublish=False  
    )  
  
    wb.Close(SaveChanges=False)
    excel.Quit()

def excel_file():
    path = os.getcwd()
    files = os.listdir(path)
    if not os.path.exists("pdf"):
        os.mkdir("pdf")
    excelfiles = [f for f in files if not f.startswith(("~$")) and f.endswith((".xlsx"))]
    for file in excelfiles:
        excel_path = os.path.join(path,file)
        pdf_name = os.path.splitext(file)[0]
        pdf_path = path + "\\" + "pdf" + "\\" + pdf_name + ".pdf"
        excel_to_pdf(excel_path, pdf_path)
        print(excel_path+"格式转换完成")
    
excel_file()
~~~