title: SQL命令
tags:
  - python
categories: []
date: 2023-04-02 20:14:00
---
#创建一个名为“day1”的数据库
create database day1;

#进去day1数据库
use day1;<!--more-->

#创建一个名为“test”的数据表
create table test(
id varchar(20)  primary key ,
name varchar(30),
password varchar(30)
);

#向test表插入一行数据
insert into test(id,name,password) values('001','lisi','123456');

#查看创建的test表的数据
select * from test;

#将id为001的密码改为xxxx
update test set password='xxxx' where id='001';

#删除test表
drop table test;

#删除day1数据库
drop database day1;