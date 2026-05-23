# 导管室收费查询系统

手机端优先的公网共享版收费查询工具。科室成员打开同一个链接查询，管理员在后台上传新版 Excel 并发布版本，所有人刷新后同步最新数据。

## 功能

- 手机端查询收费项目、旧项目映射、复杂术式判断。
- 管理员后台上传 Excel，解析为数据库数据。
- 发布新版本并填写更新说明。
- 手机端显示当前数据版本和更新时间。
- 浏览器缓存上一版数据，网络临时不可用时可继续查看缓存。

## 开发运行

```bash
npm install
npm run build
npm start
```

默认地址：

- 查询端：http://localhost:8080
- 管理端：http://localhost:8080/admin

默认管理员：

- 账号：admin
- 密码：admin123456

正式部署前建议用环境变量修改密码：

```bash
set ADMIN_PASSWORD=你的新密码
npm start
```

## 公网部署思路

1. 准备一台云服务器，安装 Node.js 24。
2. 把整个项目复制到服务器。
3. 在服务器执行：

```bash
npm install
npm run build
set ADMIN_PASSWORD=你的后台密码
set SESSION_SECRET=一串随机密钥
npm start
```

4. 开放服务器端口 `8080`。
5. 科室成员访问：

```text
http://服务器IP:8080
```

6. 管理员访问：

```text
http://服务器IP:8080/admin
```

后续可以绑定域名和 HTTPS。

## 管理员更新流程

1. 打开 `/admin`。
2. 输入管理员账号密码。
3. 上传新版 Excel。
4. 系统解析后显示项目数量。
5. 填写发布说明。
6. 点击“发布新版本”。
7. 手机端刷新页面后自动读取最新版本。

## 数据文件

运行后会自动创建：

```text
data/cath-lab-billing.sqlite
```

这是 SQLite 数据库文件，包含收费项目、旧项目映射、规则、版本和日志。

## 备份

建议定期备份整个 `data` 文件夹，尤其是：

```text
data/cath-lab-billing.sqlite
```

管理员后台也提供 JSON 备份接口：

```text
/api/admin/backup.json
```

## 注意

- 本系统不录入患者信息。
- 查询端只读取收费项目和规则数据。
- 最终收费仍以医院医保、物价、收费部门审核口径为准。
- 当前最小可用版主要覆盖心血管和神经系统 Excel 中已有项目。
