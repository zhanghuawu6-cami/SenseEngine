# SenseEngine / SenseOrder Web

SenseEngine 是序感科技的 State Computing 运行时。当前仓库已是可运行的双服务系统：
FastAPI 提供有类型的状态推断 API，Next.js 承载序感科技官网、管理后台与“状态感知与干预演示”。

核心状态循环由 `StateEstimator` 完成概率推断，`StateMemoryBank` 维护窗口内基线，
`InterventionPolicy` 在不确定性与个体基线约束下选择 Ask、Suggest Break 或 Silence。
Web 层通过 server-only 上游连接调用 FastAPI，网站内容、合作线索和媒体索引由 SQLite 管理。

## 仓库边界

| 路径 | 职责 |
| --- | --- |
| `src/sense_engine/core` | State Computing 数据契约与 `StateEstimator` |
| `src/sense_engine/memory` | 内存型 `StateMemoryBank` 与个体基线 |
| `src/sense_engine/policy` | 安全约束下的 `InterventionPolicy` |
| `src/sense_engine/api` | FastAPI 健康检查与演示 API |
| `web` | Next.js 官网、演示、管理后台、SQLite 与媒体读写 |
| `scripts` | 契约导出、双服务冒烟和 Render 发布控制器 |

## 安装

本地建议使用 Python 3.12、Node.js 22、`uv` 和 npm。所有依赖都从锁文件恢复：

```bash
uv sync --frozen --all-extras
npm --prefix web ci
```

## 本地运行

完整集成需要三个终端（或三个由同一进程监督器管理的进程）。以下值仅是本地测试占位值；
API 和 Web 必须使用同一个 `local-demo-test-key`，不得在共享环境或生产中复用。

### 终端 1：FastAPI

```bash
SENSE_ENGINE_ENV=development \
SENSE_ENGINE_SERVICE_KEY=local-demo-test-key \
UVICORN_LOG_LEVEL=info \
uv run uvicorn sense_engine.api.app:app --host 127.0.0.1 --port 8000
```

API 就绪检查：`http://127.0.0.1:8000/health/ready`，OpenAPI 文档：
`http://127.0.0.1:8000/docs`。

### 终端 2：Next.js 开发模式

```bash
ADMIN_EMAIL=local-admin@example.test \
ADMIN_PASSWORD=local-admin-test-password \
SESSION_SECRET=local-session-test-value-for-development-only \
DATABASE_PATH=/tmp/senseorder-local.db \
MEDIA_ROOT=/tmp/senseorder-local-media \
SENSE_ENGINE_PRIVATE_URL=http://127.0.0.1:8000 \
SENSE_ENGINE_SERVICE_KEY=local-demo-test-key \
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000 \
npm --prefix web run dev
```

本地生产构建与启动使用同一组测试环境变量：

```bash
NODE_ENV=production \
DATABASE_PATH=/tmp/senseorder-local.db \
npm --prefix web run build

NODE_ENV=production \
ADMIN_EMAIL=local-admin@example.test \
ADMIN_PASSWORD=local-admin-test-password \
SESSION_SECRET=local-session-test-value-for-development-only \
DATABASE_PATH=/tmp/senseorder-local.db \
MEDIA_ROOT=/tmp/senseorder-local-media \
SENSE_ENGINE_PRIVATE_URL=http://127.0.0.1:8000 \
SENSE_ENGINE_SERVICE_KEY=local-demo-test-key \
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000 \
HOSTNAME=127.0.0.1 \
PORT=3000 \
npm --prefix web run start
```

`npm run start` 使用 Next.js 的 standalone 输出：构建完成后，启动脚本会把当前 `public` 和
`.next/static` 资源组装到 `.next/standalone`，再从该目录启动 `server.js`。

### 终端 3：双服务冒烟

待前两个进程就绪后，运行真实 API 授权、公开 Web 代理和 Zod 响应契约验证：

```bash
API_BASE_URL=http://127.0.0.1:8000 \
WEB_BASE_URL=http://127.0.0.1:3000 \
SENSE_ENGINE_PRIVATE_URL=http://127.0.0.1:8000 \
SENSE_ENGINE_SERVICE_KEY=local-demo-test-key \
scripts/integration_smoke.sh
```

## 环境变量

`server-only` 变量只能注入服务器或受保护的运行环境；`public` 会被编译到浏览器可见数据中；
`CI-only` 只存放在 CircleCI production context。

| 变量 | 分类 | 使用方 | 用途 |
| --- | --- | --- | --- |
| `SENSE_ENGINE_SERVICE_KEY` | server-only | API + Web | Web 调用私有推断 API 的共享认证值 |
| `SENSE_ENGINE_PRIVATE_URL` | server-only | Web | Render 私网中的 FastAPI 地址 |
| `SENSE_ENGINE_ENV` | server-only | API | 运行环境标识 |
| `NODE_ENV` | server-only | Web | Next.js 运行模式 |
| `UVICORN_LOG_LEVEL` | server-only | API | Uvicorn 服务端日志级别 |
| `DATABASE_PATH` | server-only | Web | SQLite 文件路径 |
| `MEDIA_ROOT` | server-only | Web | 用户上传媒体根目录 |
| `ADMIN_EMAIL` | server-only | Web | 管理员登录账号 |
| `ADMIN_PASSWORD` | server-only | Web | 管理员登录凭据 |
| `SESSION_SECRET` | server-only | Web | 管理员会话签名密钥 |
| `NEXT_PUBLIC_SITE_URL` | public | Web + browser | 站点公开 canonical URL |
| `RENDER_API_KEY` | CI-only | CircleCI | Render 发布 API 认证 |
| `RENDER_API_SERVICE_ID` | CI-only | CircleCI | FastAPI Render service ID |
| `RENDER_WEB_SERVICE_ID` | CI-only | CircleCI | Next.js Render service ID |
| `PRODUCTION_WEB_URL` | CI-only | CircleCI | 发布后公开冒烟基地址 |

`NEXT_PUBLIC_SITE_URL` 可公开，且只能放网站公开地址。`SENSE_ENGINE_PRIVATE_URL` 和 `SENSE_ENGINE_SERVICE_KEY` 绝不得使用 `NEXT_PUBLIC_` 前缀，也不得进入浏览器包、日志或响应。
`NODE_ENV=production` 启用 Next.js 生产行为，并使管理员会话使用 Secure Cookie；生产运行时必须显式设置。

## Render 部署拓扑

`render.yaml` 定义两个独立容器服务，两者的 auto deploy 均关闭，只由受控 CI 发布：

| 服务 | 网络边界 | 运行与存储 |
| --- | --- | --- |
| `senseorder-web` | 公开 Web，对浏览器暴露 | `numInstances=1`；1 GB 持久磁盘挂载到 `/var/data` |
| `senseengine-api` | 私有 API，只允许 Web 通过 Render 私网访问 | 无公网入口、无持久磁盘 |

Web 将 SQLite 放在 `/var/data/senseorder.db`，媒体放在 `/var/data/media`。两者共同构成
同一一致性边界：必须一起备份、恢复和验收。在数据库迁移到 PostgreSQL 且媒体迁移到
对象存储之前，禁止扩容 Web 实例，否则 SQLite 写入和本地媒体会出现分叉。

### 快照与恢复演练

Render 对持久磁盘每 24 小时自动创建一次快照。操作员仍须在 Render Dashboard 确认最新
`/var/data` 快照的时间、状态和账户当前保留期满足恢复目标。数据库与媒体属于同一一致性边界：
恢复时必须选择同一快照对整个 `/var/data` 整体恢复，禁止单独恢复 `senseorder.db` 或 `media/`。

每季度恢复演练不得在 production 原地 restore，也不得把生产服务或生产磁盘作为演练目标。
Dashboard 的 Restore 是 Render 控制台中的人工 UI 操作，不是 CLI 命令。演练必须先创建一个
临时隔离 Web service，并为它配置独立持久磁盘、独立 Render URL、独立管理员凭据和独立
`SESSION_SECRET`。隔离服务保持单实例，不切换 DNS、不接入生产流量，也不复用生产磁盘。
`SENSE_ENGINE_PRIVATE_URL` 和 service key 应指向非生产的受控 API。

如果当前 Render Dashboard、账户权限或支持的 Restore 流程只允许对原 production 磁盘执行原地
恢复，立即 **STOP**：不得在生产环境完成演练。联系 Render 支持确认隔离恢复能力，或先建立并验证
可恢复数据库和媒体同一时点的站外一致性备份能力，再重新安排演练。

受控演练顺序如下：

1. 记录选定快照时间、生产 deploy ID、保留期和操作员；创建临时隔离 Web service 与独立磁盘，
   但不切换 DNS、不接入生产流量。
2. 在 Dashboard 的 Restore 流程中，把选定的同一快照整体恢复到隔离磁盘，确认挂载点仍为
   `/var/data`；等待隔离服务健康。禁止对生产磁盘点击 Restore。
3. 从快照记录中选择一个已知存在且非空的媒体文件名。通过 secret manager 预置独立管理员密码，
   或在不会记录输入的受控终端交互读取；不要把密码作为命令行赋值或写入 shell history：

```bash
read -rs -p 'Isolated drill admin password: ' ADMIN_PASSWORD
printf '\n'
export ADMIN_PASSWORD
export ADMIN_EMAIL RESTORE_DRILL_MEDIA_FILENAME
export RESTORE_DRILL_WEB_URL PRODUCTION_WEB_URL
export RESTORE_DRILL_ISOLATED_TARGET=confirmed
scripts/verify_restore_drill.sh
```

`RESTORE_DRILL_WEB_URL` 必须是隔离服务的公开 HTTPS base URL；`PRODUCTION_WEB_URL` 也是必填项，
但只作为防止误指向生产的对照值。脚本使用私有临时目录、严格超时、无重定向请求和 Zod 响应校验，依次验证
health、bodyless demo、独立管理员登录、数据库媒体记录和公开媒体字节数，不输出凭据或失败响应体。

4. 在临时隔离服务的 Render Web Shell 内对实际挂载数据运行闭集一致性校验；镜像已包含该脚本：

```bash
DATABASE_PATH=/var/data/senseorder.db \
MEDIA_ROOT=/var/data/media \
node scripts/verify-restored-data.mjs
```

5. 记录 Restore 操作人、隔离服务和磁盘标识、验收结果、恢复耗时及发现的问题。保存不含凭据的
   演练记录后，销毁隔离 Web service、独立持久磁盘和临时凭据，确认生产资源从未被修改。

## CircleCI 门禁与发布

`verify-and-deploy` 工作流包含六个生产门禁：`python-gate`、`web-gate`、`contract-gate`、
`integration-gate`、`browser-gate` 和 `container-gate`。部署必须等六个门禁全部通过。

CircleCI 的 `senseorder-production` context 只配置以下四个变量，不应授权给任何验证 gate：

- `RENDER_API_KEY`
- `RENDER_API_SERVICE_ID`
- `RENDER_WEB_SERVICE_ID`
- `PRODUCTION_WEB_URL`

`senseorder-production` 是独立于仓库配置的 CircleCI 平台外部安全边界。`deploy-render` 的 main-only
job filter 本身不能保护 context：其他 job 仍可能引用它，因此必须同时使用平台侧限制。

CircleCI organization admin 必须在 **Organization Settings → Contexts → `senseorder-production` →
Security** 中完成以下配置：

1. 在 **Project restrictions** 中只添加 `gh/zhanghuawu6-cami/SenseEngine`；如果 UI 显示不可变
   project ID，则核对并记录该仓库对应的 project ID，不能添加其他项目。
2. 在 **Expression restrictions** 中添加并保存精确表达式
   `pipeline.git.branch == "main" and not job.ssh.enabled and not (pipeline.config_source starts-with "api")`。
3. 如果 context 仍为默认 `All members` 或无限制访问，删除该默认访问并按组织权限策略只保留
   经批准的生产发布人员组。不要打开、复制或记录 context 中的 secret 值。

配置后执行以下 UI 只读验证，并在变更记录中保存不含 secret 的页面状态、操作人和时间：

1. 重新打开上述 **Security** 页面，确认 Project restrictions 只列出目标项目，Expression restrictions
   只列出上述强表达式，且不存在 `All members` 或无限制访问。
2. 在项目的 **Run Pipeline** 页面选择一个 feature branch，添加 boolean 参数 `context_probe=true`
   并运行。`context_probe=true` 时只运行专用 `production-context-verification` workflow，其中只有
   `production-context-probe`，不运行 `verify-and-deploy`，也不触发 `deploy-render`。预期 CircleCI
   在 executor 启动前显示 `Unauthorized`，部署 job 不应获得 secret；仅看到 branch filter 跳过部署
   不能作为 context unauthorized 的证据。
3. 回到 **Run Pipeline**，选择 `main` 并再次设置 `context_probe=true`，完成 main 正向验证。
   仍应只调度同一个 probe job；确认 context 授权通过、job 成功且日志只有固定授权消息，不含任何
   变量值，也不调用 Render 或触发真实部署。记录两个 pipeline URL 和结果，不记录 secret 值。
4. `context_probe=false` 是默认值；只有该值才运行正常 `verify-and-deploy` 门禁，并在 `main` 门禁
   全部成功后调度 `deploy-render`。不得把默认值用于上述 context 正负验证。

两项限制和正负验证全部完成前必须 **STOP**，禁止生产部署。本机没有具备组织只读权限的
CircleCI token 时，仓库文件和本地命令不能证明平台状态，必须由 organization admin 在 CircleCI UI
完成并留存上述验证。

`deploy-render` 仅 `main` 分支可运行，使用 `serial-group` 串行化生产发布，防止两个工作流互相覆盖。
功能分支只运行门禁，不触发生产变更。

### 发布与回滚

`scripts/render_release.py` 先保存旧 API deploy 和旧 Web deploy，再按 API → Web 顺序发布，
最后对公开 `/api/health` 和 `/api/demo/run` 做契约冒烟。任一部署或冒烟失败时，
发布控制器会按 Web → API 顺序自动回滚到两个已保存的旧 deploy。

如自动回滚未完成：

1. 停止新发布，保留 CircleCI 日志中已脱敏的 deploy ID 与失败阶段。
2. 打开 Render Dashboard 的 `senseorder-web` deploy 历史，选择发布前记录的最后一个已知可用 deploy，
   完成旧 Web deploy 回滚并等待状态恢复。
3. 打开 `senseengine-api` deploy 历史，选择对应的最后一个已知可用 deploy，完成旧 API deploy 回滚并等待状态恢复。
4. 通过公开 Web 检查双服务链路，并再次执行 Zod demo 响应验证：

```bash
curl --fail --silent --show-error "$PRODUCTION_WEB_URL/api/health"
curl --fail --silent --show-error --request POST "$PRODUCTION_WEB_URL/api/demo/run" \
  | npm --prefix web run validate:demo-response
```

人工处置只使用受权的 Render Dashboard 会话和 CircleCI context；文档不保存管理地址、令牌或凭据值。

## 开发门禁

```bash
uv run pytest
uv run mypy
uv run ruff check .
npm --prefix web run check:api
npm --prefix web run test
npm --prefix web run typecheck
npm --prefix web run lint
DATABASE_PATH=/tmp/senseorder-release-build.db npm --prefix web run build
npm --prefix web run test:e2e
```
