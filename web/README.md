# 序感科技企业官网

面向品牌展示、技术叙事、合作线索和长期内容运营的全栈官网。公开站点与管理后台位于同一套 Next.js 应用中，数据默认通过成熟的 `better-sqlite3` 驱动写入本地 SQLite，适合单机或容器部署。

## 本地启动

```bash
npm install
cp .env.example .env.local
npm run dev
```

- 官网：`http://localhost:3000`
- 管理后台：`http://localhost:3000/admin`
- 默认开发账号：`admin@senseorder.local` / `change-me-now`

首次用于公开环境前，必须配置 `ADMIN_EMAIL`、`ADMIN_PASSWORD` 和至少 32 位的 `SESSION_SECRET`。

## 内容能力

- 洞察文章、公司动态与岗位的新增、编辑、发布、排序和下线
- 合作线索收集、状态流转与备注
- 图片上传与媒体库
- 全局品牌文案、联系入口和站点状态管理
- 草稿与已发布内容分离

## 扩展边界

`lib/repository.ts` 是页面与数据存储之间的唯一边界。当前实现使用 SQLite，后续可替换为 PostgreSQL、对象存储或第三方 CMS，而不需要重写页面组件。`public/uploads` 适合单机部署；多实例部署时应把媒体仓储切换到 OSS/S3。

内容规划见 [docs/content-strategy.md](./docs/content-strategy.md)。
