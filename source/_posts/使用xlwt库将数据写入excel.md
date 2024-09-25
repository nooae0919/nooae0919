title: 使用xlwt库将数据写入excel
tags: python
date: 2023-03-27 20:14:23
---
~~~
import xlwt
#1. 创建workbook对象
workbook = xlwt.Workbook(encoding="utf-8")
#2. 增加一个sheet # 设置成可以覆盖原先内容
worksheet = workbook.add_sheet("sheet1", cell_overwrite_ok=True)
#3. 在单元格中添加内容，第一个参数为行，第二个参数为列，第三个参数为内容
worksheet.write(0,0, "hello")
#4. 保存数据表
workbook.save("./student.xls")
~~~