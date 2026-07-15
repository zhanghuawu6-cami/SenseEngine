# SenseOrder Deployment and CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Next.js 与 FastAPI 构建为两个独立容器，在 Render 以公开 Web、私有 API、单实例持久磁盘部署，并通过 CircleCI 全门禁、部署后冒烟和自动回滚发布。

**Architecture:** 两个 Dockerfile 共享单仓库但不共享运行进程。Render Blueprint 固定 Web 单实例和 `/var/data` 磁盘，FastAPI 只在私有网络暴露；CircleCI 并行运行 Python、Web、契约、集成、浏览器和容器门禁，只有 `main` 可以调用受控 Render 发布脚本。

**Tech Stack:** Docker、Render Blueprint/API、CircleCI 2.1、Python 3.12、Node.js 22、uv、npm、Playwright、curl、jq、PyYAML

---

## 文件结构

**创建：**

- `.dockerignore`：API 构建上下文排除规则。
- `Dockerfile.api`：FastAPI 非 root production image。
- `web/.dockerignore`：Web 构建排除规则。
- `web/Dockerfile`：Next.js standalone 非 root production image。
- `render.yaml`：双服务 Blueprint、磁盘和环境变量。
- `tests/deployment/test_container_contract.py`：Dockerfile 静态边界。
- `tests/deployment/test_render_blueprint.py`：Blueprint 结构测试。
- `scripts/integration_smoke.sh`：本地双服务完整冒烟。
- `scripts/render_release.py`：记录旧版本、部署、冒烟、回滚。
- `tests/deployment/test_render_release.py`：发布状态机测试。
- `.circleci/config.yml`：验证与发布工作流。
- `web/scripts/validate-demo-response.ts`：CI 中用 Zod 校验真实 API JSON。

**修改：**

- `pyproject.toml`、`uv.lock`：加入 PyYAML 测试依赖。
- `web/next.config.ts`：启用 standalone 输出。
- `web/package.json`：加入 CI 响应校验脚本。
- `README.md`：本地运行、环境变量、部署和回滚说明。

### Task 1: 构建两个最小非 root 容器

- [ ] **Step 1: 编写容器契约 Red 测试**

创建 `tests/deployment/test_container_contract.py`：

```python
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_api_container_is_locked_and_non_root() -> None:
    dockerfile = (ROOT / "Dockerfile.api").read_text()
    assert "FROM python:3.12-slim" in dockerfile
    assert "uv sync --frozen --no-dev" in dockerfile
    assert "USER app" in dockerfile
    assert 'CMD ["uvicorn", "sense_engine.api.app:app"' in dockerfile


def test_web_container_is_standalone_and_non_root() -> None:
    dockerfile = (ROOT / "web/Dockerfile").read_text()
    assert "FROM node:22-bookworm-slim" in dockerfile
    assert "npm ci" in dockerfile
    assert "USER nextjs" in dockerfile
    assert 'CMD ["node", "server.js"]' in dockerfile
```

- [ ] **Step 2: 运行测试确认 Red**

Run: `uv run pytest tests/deployment/test_container_contract.py -v`

Expected: FAIL，因为两个 Dockerfile 不存在。

- [ ] **Step 3: 创建 API Dockerfile 与排除规则**

创建 `.dockerignore`：

```dockerignore
.git
.venv
.mypy_cache
.pytest_cache
.ruff_cache
.superpowers
web
tests
docs
*.db
*.db-*
.env*
```

创建 `Dockerfile.api`：

```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/app/.venv/bin:$PATH

WORKDIR /app
RUN groupadd --system app && useradd --system --gid app --create-home app
COPY --from=ghcr.io/astral-sh/uv:0.8.6 /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock README.md ./
COPY src ./src
RUN uv sync --frozen --no-dev && chown -R app:app /app

USER app
EXPOSE 8000
CMD ["uvicorn", "sense_engine.api.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
```

- [ ] **Step 4: 启用 Next standalone 并创建 Web Dockerfile**

在 `web/next.config.ts` 中加入 `output: "standalone"`，保留 `poweredByHeader: false`。

创建 `web/.dockerignore`：

```dockerignore
node_modules
.next
.env*
data/*.db*
public/uploads/*
!.gitkeep
npm-debug.log*
```

创建 `web/Dockerfile`：

```dockerfile
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_PATH=/tmp/senseorder-build.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 5: 运行静态契约和实际镜像构建**

Run: `uv run pytest tests/deployment/test_container_contract.py -v`

Run: `docker build -f Dockerfile.api -t senseengine-api:test .`

Run: `docker build -f web/Dockerfile -t senseorder-web:test web`

Expected: 测试和两个 build 均退出码为 0。

- [ ] **Step 6: 运行容器健康冒烟**

启动 API 容器并注入 `SENSE_ENGINE_SERVICE_KEY=container-test-key`，断言 `/health/ready` 为 200。启动 Web 容器时注入临时 `/var/data` volume、FastAPI 地址和同一密钥，断言 `/api/health` 为 200。

Run: `docker image inspect senseengine-api:test --format '{{.Config.User}}'`

Expected: `app`。

Run: `docker image inspect senseorder-web:test --format '{{.Config.User}}'`

Expected: `nextjs`。

- [ ] **Step 7: 提交容器化**

```bash
git add .dockerignore Dockerfile.api web/.dockerignore web/Dockerfile web/next.config.ts tests/deployment/test_container_contract.py
git commit -m "build: containerize SenseOrder web and API"
```

### Task 2: 定义并验证 Render Blueprint

- [ ] **Step 1: 增加 YAML 测试依赖**

在 `pyproject.toml` dev 依赖加入 `"pyyaml>=6.0.2,<7"`，然后运行：

Run: `uv lock`

Run: `uv sync --frozen --all-extras`

- [ ] **Step 2: 编写 Blueprint Red 测试**

创建 `tests/deployment/test_render_blueprint.py`，使用 `yaml.safe_load` 断言：

```python
def test_render_blueprint_has_public_web_private_api_and_one_disk() -> None:
    blueprint = yaml.safe_load((ROOT / "render.yaml").read_text())
    services = {item["name"]: item for item in blueprint["services"]}
    web = services["senseorder-web"]
    api = services["senseengine-api"]

    assert web["type"] == "web"
    assert web["numInstances"] == 1
    assert web["healthCheckPath"] == "/api/health"
    assert web["disk"] == {
        "name": "senseorder-data",
        "mountPath": "/var/data",
        "sizeGB": 1,
    }
    assert api["type"] == "pserv"
    assert api["healthCheckPath"] == "/health/ready"
    assert "disk" not in api
```

另断言 Web 的 `DATABASE_PATH=/var/data/senseorder.db`、`MEDIA_ROOT=/var/data/media`，两个服务都引用同一个 secret group，任何变量名都不以 `NEXT_PUBLIC_SENSE_ENGINE` 开头。

- [ ] **Step 3: 运行测试确认 Red**

Run: `uv run pytest tests/deployment/test_render_blueprint.py -v`

Expected: FAIL，因为 `render.yaml` 不存在。

- [ ] **Step 4: 创建 Render Blueprint**

创建 `render.yaml`：

```yaml
envVarGroups:
  - name: senseorder-shared-secrets
    envVars:
      - key: SENSE_ENGINE_SERVICE_KEY
        generateValue: true

services:
  - type: pserv
    name: senseengine-api
    runtime: docker
    dockerfilePath: ./Dockerfile.api
    dockerContext: .
    healthCheckPath: /health/ready
    envVars:
      - fromGroup: senseorder-shared-secrets
      - key: SENSE_ENGINE_ENV
        value: production
      - key: LOG_LEVEL
        value: info

  - type: web
    name: senseorder-web
    runtime: docker
    dockerfilePath: ./web/Dockerfile
    dockerContext: ./web
    healthCheckPath: /api/health
    numInstances: 1
    disk:
      name: senseorder-data
      mountPath: /var/data
      sizeGB: 1
    envVars:
      - fromGroup: senseorder-shared-secrets
      - key: DATABASE_PATH
        value: /var/data/senseorder.db
      - key: MEDIA_ROOT
        value: /var/data/media
      - key: SENSE_ENGINE_PRIVATE_URL
        value: http://senseengine-api:8000
      - key: NODE_ENV
        value: production
      - key: NEXT_PUBLIC_SITE_URL
        sync: false
      - key: ADMIN_EMAIL
        sync: false
      - key: ADMIN_PASSWORD
        sync: false
      - key: SESSION_SECRET
        generateValue: true
```

- [ ] **Step 5: 运行 Blueprint 测试确认 Green**

Run: `uv run pytest tests/deployment/test_render_blueprint.py -v`

Expected: 全部通过。

- [ ] **Step 6: 提交 Blueprint**

```bash
git add render.yaml pyproject.toml uv.lock tests/deployment/test_render_blueprint.py
git commit -m "deploy: define Render dual-service blueprint"
```

### Task 3: 创建双服务集成冒烟

- [ ] **Step 1: 创建 Zod CLI 校验器**

创建 `web/scripts/validate-demo-response.ts`：从 stdin 读取 UTF-8 JSON，调用 `demoRunSchema.parse`，额外断言动作顺序和基线后输出 `validated SenseEngine demo response`。任何失败让进程退出 1，不打印完整响应。

在 `web/package.json` 加入：

```json
{
  "validate:demo-response": "tsx scripts/validate-demo-response.ts"
}
```

Run: `npm --prefix web install --save-dev tsx@4.20.5`

- [ ] **Step 2: 编写集成脚本**

创建 `scripts/integration_smoke.sh`，设置 `set -euo pipefail`，要求 `SENSE_ENGINE_SERVICE_KEY`，顺序执行：

1. 轮询 `http://127.0.0.1:8000/health/ready` 最多 30 秒。
2. 无密钥 POST 断言 401。
3. 有密钥 POST 保存到 `/tmp/senseengine-demo-response.json`。
4. 用 `npm --prefix web run validate:demo-response` 校验该文件。
5. 轮询 `http://127.0.0.1:3000/api/health` 最多 60 秒。
6. POST `http://127.0.0.1:3000/api/demo/run`，再次用 Zod 校验。
7. 检查两个响应都不包含 `SENSE_ENGINE_PRIVATE_URL` 或密钥值。
8. trap 删除两个临时响应文件。

脚本只输出阶段名和 HTTP 状态，不输出响应体。

- [ ] **Step 3: 运行脚本确认 Green**

分别在后台启动 FastAPI 与 Next.js production server，再运行：

Run: `SENSE_ENGINE_SERVICE_KEY=integration-key scripts/integration_smoke.sh`

Expected: 输出两次 `validated SenseEngine demo response` 并退出 0。

- [ ] **Step 4: 提交集成冒烟**

```bash
git add scripts/integration_smoke.sh web/scripts/validate-demo-response.ts web/package.json web/package-lock.json
git commit -m "test: add dual-service integration smoke"
```

### Task 4: 实现可测试的 Render 发布与回滚状态机

- [ ] **Step 1: 编写发布 Red 测试**

创建 `tests/deployment/test_render_release.py`，mock `urllib.request.urlopen` 和 smoke runner，覆盖：

- 发布前分别记录两个服务最近的 `live` deploy ID。
- API 先部署并到 live，再部署 Web。
- 两个 live 后才运行公开 `/api/health` 与 `/api/demo/run` 冒烟。
- 任一部署或冒烟失败时，对两个服务调用 rollback，使用各自旧 ID。
- 回滚后再次检查健康；回滚失败退出非零。
- 日志不包含 API key、服务密钥或响应体。

- [ ] **Step 2: 运行测试确认 Red**

Run: `uv run pytest tests/deployment/test_render_release.py -v`

Expected: FAIL，因为 `render_release.py` 不存在。

- [ ] **Step 3: 实现发布脚本**

创建 `scripts/render_release.py`，使用标准库 `urllib.request`，要求环境变量：

```text
RENDER_API_KEY
RENDER_API_SERVICE_ID
RENDER_WEB_SERVICE_ID
PRODUCTION_WEB_URL
```

实现六个带完整类型的函数：`get_live_deploy(service_id: str) -> str`、`start_deploy(service_id: str) -> str`、`wait_for_live(service_id: str, deploy_id: str, timeout_seconds: int = 900) -> None`、`rollback(service_id: str, deploy_id: str) -> None`、`smoke_web(base_url: str) -> None` 和 `release() -> None`。前四个只通过同一个私有 `_render_request` 调用 Render；`release` 负责保存旧 ID、API → Web 发布、smoke 和 Web → API 回滚顺序。

HTTP 路径固定为：

- `GET /v1/services/{service_id}/deploys?limit=20`
- `POST /v1/services/{service_id}/deploys`
- `GET /v1/services/{service_id}/deploys/{deploy_id}`
- `POST /v1/services/{service_id}/rollback`，JSON body `{"deployId": old_deploy_id}`

Authorization header 为 `Bearer ${RENDER_API_KEY}`，但错误对象和日志不得包含 header。轮询间隔 10 秒，单服务超时 900 秒。发布顺序 API → Web；失败时按 Web → API 逆序回滚。

`smoke_web` 只访问 `${PRODUCTION_WEB_URL}/api/health` 和 POST `${PRODUCTION_WEB_URL}/api/demo/run`，断言 200、三步、固定动作与基线，不打印 body。

- [ ] **Step 4: 运行发布单测确认 Green**

Run: `uv run pytest tests/deployment/test_render_release.py -v`

Expected: 全部通过，不发真实网络请求。

- [ ] **Step 5: 运行静态检查并提交**

Run: `uv run mypy scripts/render_release.py tests/deployment/test_render_release.py`

Run: `uv run ruff check scripts tests/deployment`

Expected: 均退出码为 0。

```bash
git add scripts/render_release.py tests/deployment/test_render_release.py
git commit -m "deploy: add Render release and rollback controller"
```

### Task 5: 建立 CircleCI 并行门禁与 main-only 发布

- [ ] **Step 1: 编写 CI 结构 Red 测试**

创建 `tests/deployment/test_circleci_config.py`，解析 `.circleci/config.yml` 并断言 workflow 包含：

```python
required = {
    "python-gate",
    "web-gate",
    "contract-gate",
    "integration-gate",
    "browser-gate",
    "container-gate",
    "deploy-render",
}
job_names = {
    item if isinstance(item, str) else next(iter(item))
    for item in workflow["jobs"]
}
assert required <= job_names
```

另断言 `deploy-render` requires 前六个 gate，且 filter 只允许 `main`、忽略 tags；其他 gate 不需要部署密钥。

- [ ] **Step 2: 运行测试确认 Red**

Run: `uv run pytest tests/deployment/test_circleci_config.py -v`

Expected: FAIL，因为 `.circleci/config.yml` 不存在。

- [ ] **Step 3: 创建 CircleCI config**

使用 `version: 2.1` 和 Docker executor：Python jobs 使用 `cimg/python:3.12-node`，Web/browser 使用 `cimg/node:22.14-browsers`，container 使用 `setup_remote_docker`。工作流依赖：

```yaml
workflows:
  verify-and-deploy:
    jobs:
      - python-gate
      - web-gate
      - contract-gate
      - integration-gate:
          requires: [python-gate, web-gate, contract-gate]
      - browser-gate:
          requires: [integration-gate]
      - container-gate:
          requires: [python-gate, web-gate]
      - deploy-render:
          context: senseorder-production
          requires:
            - python-gate
            - web-gate
            - contract-gate
            - integration-gate
            - browser-gate
            - container-gate
          filters:
            branches:
              only: main
            tags:
              ignore: /.*/
```

各 job 使用以下准确命令：

- Python：`uv sync --frozen --all-extras`、`uv run pytest`、`uv run mypy`、`uv run ruff check .`。
- Web：`npm --prefix web ci`、`npm --prefix web run test`、`typecheck`、`lint`、临时 DB production build。
- Contract：重新导出 OpenAPI 和真实 demo fixture、重新生成 TS，`git diff --exit-code` 检查三个生成文件。
- Integration：后台启动 API 和 production Web，执行 `scripts/integration_smoke.sh`。
- Browser：安装 Playwright chromium，执行 `npm --prefix web run test:e2e`，失败时存储 screenshots/traces artifacts。
- Container：构建两个镜像并执行健康检查。
- Deploy：`uv run python scripts/render_release.py`。

缓存 key 必须包含 `uv.lock` 或 `web/package-lock.json` checksum；不得缓存 `.env`、SQLite 或媒体目录。

- [ ] **Step 4: 运行本地配置验证**

Run: `uv run pytest tests/deployment/test_circleci_config.py -v`

Run: `circleci config validate .circleci/config.yml`

Expected: 测试通过，CircleCI CLI 输出 `Config file at .circleci/config.yml is valid.`。

- [ ] **Step 5: 提交 CI**

```bash
git add .circleci/config.yml tests/deployment/test_circleci_config.py
git commit -m "ci: add verification and Render deployment workflow"
```

### Task 6: 文档、全量验证和发布准备

- [ ] **Step 1: 更新运行与部署文档**

在 `README.md` 增加：

- `uv sync --frozen --all-extras` 和 `npm --prefix web ci`。
- 本地 FastAPI、Next.js 与完整 integration smoke 命令。
- 所有环境变量名及其“server-only/public”分类，不包含真实值。
- Render Web 单实例、1 GB `/var/data` 磁盘、SQLite 与媒体备份边界。
- 在 Render 开启 `/var/data` 每日磁盘快照；恢复必须从同一快照同时恢复 `senseorder.db` 与 `media/`，禁止单独恢复其一；记录每季度一次的恢复演练命令和验收项。
- CircleCI `senseorder-production` context 所需四个变量。
- 发布失败自动回滚、回滚失败的人工 Render dashboard 处置路径。
- PostgreSQL/对象存储迁移前禁止增加 Web instances。

- [ ] **Step 2: 运行完整 Python 门禁**

Run: `uv sync --frozen --all-extras`

Run: `uv run pytest`

Run: `uv run mypy`

Run: `uv run ruff check .`

Expected: 全部退出码为 0。

- [ ] **Step 3: 运行完整 Web 门禁**

Run: `npm --prefix web ci`

Run: `npm --prefix web run check:api`

Run: `npm --prefix web run test`

Run: `npm --prefix web run typecheck`

Run: `npm --prefix web run lint`

Run: `DATABASE_PATH=/tmp/senseorder-release-build.db npm --prefix web run build`

Run: `npm --prefix web run test:e2e`

Expected: 全部退出码为 0。

- [ ] **Step 4: 运行容器和集成门禁**

Run: `docker build -f Dockerfile.api -t senseengine-api:release .`

Run: `docker build -f web/Dockerfile -t senseorder-web:release web`

Run: `SENSE_ENGINE_SERVICE_KEY=release-check scripts/integration_smoke.sh`

Expected: 两个镜像构建成功，完整三步冒烟通过。

- [ ] **Step 5: 最终安全与 Git 审计**

Run: `git diff --check main...HEAD`

Run: `git ls-files | rg '(^|/)(\.env|node_modules|\.next|\.superpowers)(/|$)|\.db($|-)|public/uploads/.+' | rg -v 'public/uploads/\.gitkeep$'`

Expected: 第一条退出 0，第二条无输出且退出 1。

Run: `git status --short`

Expected: 工作树干净。

- [ ] **Step 6: 提交文档**

```bash
git add README.md
git commit -m "docs: document SenseOrder web deployment"
```

- [ ] **Step 7: 推送功能分支并观察 CI**

Run: `git push -u origin feat/web-demo-app`

Expected: CircleCI 前六个 gate 通过；`deploy-render` 因非 `main` 被过滤，不发生生产部署。
