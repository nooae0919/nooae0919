title: PDF转图片
tags:
  - python
categories: []
date: 2023-04-05 20:14:00
---
import os
import fitz  # fitz就是pip install PyMuPDF
<!--more-->
def pyMuPDF_fitz(pdfPath, imagePath):
+ print("imagePath=" + imagePath)
+ pdfDoc = fitz.open(pdfPath)
+ for pg in range(pdfDoc.pageCount):
    + page = pdfDoc[pg]
    + rotate = int(0)
    + \#每个尺寸的缩放系数为1.3，这将为我们生成分辨率提高2.6的图像。
    + \#此处若是不做设置，默认图片大小为：792X612, dpi=96
    + zoom_x = 1.33333333  # (1.33333333-->1056x816)   (2-->1584x1224)
    + zoom_y = 1.33333333
    + mat = fitz.Matrix(zoom_x, zoom_y).preRotate(rotate)
    + pix = page.getPixmap(matrix=mat, alpha=False)

    + if not os.path.exists(imagePath):  # 判断存放图片的文件夹是否存在
        + os.makedirs(imagePath)  # 若图片文件夹不存在就创建

    + pix.writePNG(imagePath + '/' + 'images_%s.png' % pg)  # 将图片写入指定的文件夹内

if \_\_name\_\_ == "\_\_main\_\_":
+ \#1、PDF地址
+ pdfPath = '123.pdf'
+ \#2、需要储存图片的目录
+ imagePath = './imgs'
+ pyMuPDF_fitz(pdfPath, imagePath)