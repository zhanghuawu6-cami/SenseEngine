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
LOG_LEVEL=info \
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
DATABASE_PATH=/tmp/senseorder-local.db npm --prefix web run build

ADMIN_EMAIL=local-admin@example.test \
ADMIN_PASSWORD=local-admin-test-password \
SESSION_SECRET=local-session-test-value-for-development-only \
DATABASE_PATH=/tmp/senseorder-local.db \
MEDIA_ROOT=/tmp/senseorder-local-media \
SENSE_ENGINE_PRIVATE_URL=http://127.0.0.1:8000 \
SENSE_ENGINE_SERVICE_KEY=local-demo-test-key \
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000 \
npm --prefix web run start
```

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
| `LOG_LEVEL` | server-only | API | 服务端日志级别 |
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

1. 在 Render Dashboard 的 `senseorder-web` 持久磁盘设置中开启并定期确认每日 `/var/data` 快照。
2. 恢复时必须选择同一快照对整个 `/var/data` 整体恢复，使数据库与媒体回到同一时点；
   禁止单独恢复 `senseorder.db` 或 `media/`。
3. 每季度安排一次受控恢复演练：记录快照时间和当前 deploy ID，进入 Dashboard 的 Restore
   流程选择快照，确认恢复整个挂载点，等待服务重新可用后执行下方验收。

Dashboard 的 Restore 是 Render 控制台中的人工 UI 操作，不是 CLI 命令；本仓库没有伪造的恢复脚本。
操作员应在受控终端预先注入 `PRODUCTION_WEB_URL`、`ADMIN_EMAIL`、`ADMIN_PASSWORD` 和
`RESTORE_DRILL_MEDIA_FILENAME`，不把它们写入命令历史或文档。

```bash
curl --fail --silent --show-error "$PRODUCTION_WEB_URL/api/health"

curl --fail --silent --show-error --request POST "$PRODUCTION_WEB_URL/api/demo/run" \
  | npm --prefix web run validate:demo-response

curl --fail --silent --show-error \
  --cookie-jar /tmp/senseorder-restore-drill.cookies \
  --header "Origin: $PRODUCTION_WEB_URL" \
  --header 'Content-Type: application/json' \
  --data "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  "$PRODUCTION_WEB_URL/api/admin/login"

curl --fail --silent --show-error \
  --cookie /tmp/senseorder-restore-drill.cookies \
  "$PRODUCTION_WEB_URL/api/admin/media"

curl --fail --silent --show-error \
  "$PRODUCTION_WEB_URL/api/media/$RESTORE_DRILL_MEDIA_FILENAME" \
  --output /tmp/senseorder-restore-media.bin
test -s /tmp/senseorder-restore-media.bin
```

最后，在 Render Web Shell 内运行一致性检查；任一 SQLite 媒体记录缺少对应文件都必须使演练失败：

```bash
node -e 'const fs=require("node:fs");const path=require("node:path");const Database=require("better-sqlite3");const db=new Database("/var/data/senseorder.db",{readonly:true});const missing=db.prepare("SELECT filename FROM media").all().filter(row=>!fs.existsSync(path.join("/var/data/media", row.filename)));if(missing.length){console.error(missing);process.exit(1)}console.log("DB-media consistency passed")'
```

将快照时间、Restore 操作人、deploy ID、上述验收结果和恢复耗时记入季度演练记录。

## CircleCI 门禁与发布

`verify-and-deploy` 工作流包含六个生产门禁：`python-gate`、`web-gate`、`contract-gate`、
`integration-gate`、`browser-gate` 和 `container-gate`。部署必须等六个门禁全部通过。

CircleCI 的 `senseorder-production` context 只配置以下四个变量，不应授权给任何验证 gate：

- `RENDER_API_KEY`
- `RENDER_API_SERVICE_ID`
- `RENDER_WEB_SERVICE_ID`
- `PRODUCTION_WEB_URL`

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
