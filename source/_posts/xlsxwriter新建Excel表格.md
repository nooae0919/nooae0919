---
title: xlsxwriter新建Excel表格
date: 2023-03-27 20:14:23
tags: python
---
import xlsxwriter

#新建excel表
workbook = xlsxwriter.Workbook('D:/hello.xlsx')
<!--more-->

#新建sheet（sheet的名称为"sheet1"）
worksheet = workbook.add_worksheet()

#定义表头内容
Title = ['实例ID', '实例配置', '实例名', '地域', '安全组', 'EIP']

#定义标题格式
merge_format = workbook.add_format({
+ 'bold': True,
+ 'border': 1,
+ 'align': 'center',
+ 'valign': 'vcenter',
+ 'fg_color': '#E0FFFF'
})

#定义表头格式
title_format = workbook.add_format({
+ 'bold': True,
+ 'border': 1,
+ 'align': 'center',
+ 'valign': 'vcenter',
+ 'fg_color': '#87CEFF'
})

#定义内容格式
data_format = workbook.add_format({
+ 'border': 1,
+ 'align': 'center',
+ 'valign': 'vcenter',
+ 'fg_color': '#EED8AE'
})

#拟数据
data = [['i-1', '1C1G', 'demo1', '上海', 'sg-1', '172.20.2.10'],
+ ['i-2', '1C1G', 'demo2', '郑州', 'sg-2', '172.20.2.11'],
+ ['i-3', '1C1G', 'demo3', '北京', 'sg-3', '172.20.2.12']]

#合并 A1 - F1 单元格作为标题，传入参数：1：合并单元格，2：标题文字，3：标题格式
worksheet.merge_range('A1:F1', 'ECS信息表', merge_format)

#设置列宽，指定 A - F 的列宽为 25
worksheet.set_column('A:F', 25)

#设置行号，指定行数，高度，A1 为 0，A2 为 1，以此类推
worksheet.set_row(0, 60)

#write_row ，写行，传入参数：1：行，2：内容，3：格式
worksheet.write_row('A2', Title, title_format)
i = 3
for ECS in data:
+ worksheet.write_row('A' + str(i), ECS, data_format)
+ i += 1

#将excel文件保存关闭，如果没有这一行运行代码会报错
workbook.close()