# SenseOrder Web Experience Integration Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 SenseOrder 官网与 SenseEngine 状态循环整合为单仓库、双服务、可部署且可验证的 Web 演示。

**Architecture:** 本路线图把批准规格拆成四份顺序执行的实施计划，每份都产生可独立验证的提交。Next.js 只通过同源代理访问私有 FastAPI；OpenAPI 是静态类型来源，Zod 是网络边界运行时校验，Render 和 CircleCI 在最后一阶段接入。

**Tech Stack:** Python 3.12、FastAPI、Pydantic v2、uv、Next.js 16、React 19、TypeScript 5、Zod 4、Vitest、Testing Library、Playwright、SQLite、Docker、CircleCI、Render

---

## 执行顺序

1. `docs/superpowers/plans/2026-07-15-senseorder-web-foundation.md`
   - 迁入官网源码。
   - 建立 Web 测试与类型检查基线。
   - 把媒体文件改为可挂载存储。
   - 提取稳定视觉 token。
2. `docs/superpowers/plans/2026-07-15-senseengine-demo-api.md`
   - 新增 FastAPI 健康检查、认证、固定三场景编排和错误边界。
   - 导出 OpenAPI，并锁定 Python 依赖。
3. `docs/superpowers/plans/2026-07-15-senseorder-web-experience.md`
   - 生成 TypeScript 类型并实现 Zod 校验、限流代理和客户端状态机。
   - 完成首页 Preview、`/experience` 桌面舞台和移动端单舞台轮播。
4. `docs/superpowers/plans/2026-07-15-senseorder-deployment-cicd.md`
   - 容器化两个服务。
   - 定义 Render Blueprint、CircleCI 门禁、部署后冒烟和自动回滚。

四份计划必须按顺序执行。任何阶段失败都不得跳到下一阶段，也不得在前端用硬编码结果掩盖尚未可用的 API。

## 规格覆盖矩阵

| 批准规格 | 实施计划与任务 |
| --- | --- |
| 官网迁入、禁入文件、样式治理 | Web Foundation Task 1、Task 4 |
| SQLite 单实例、媒体持久磁盘与同点恢复 | Web Foundation Task 3；Deployment Task 2、Task 6 |
| 固定三场景、写入前基线、请求隔离 | Demo API Task 3、Task 4 |
| API 认证、无请求体、全有或全无错误 | Demo API Task 5 |
| OpenAPI、生成 TS、Zod 运行时校验 | Demo API Task 6；Web Experience Task 1 |
| 30 次/分钟、4 并发、20 秒超时 | Web Experience Task 2 |
| idle/running/success/unavailable 与 2 秒提示 | Web Experience Task 3 |
| 首页真实 Preview | Web Experience Task 4 |
| 桌面状态舞台、移动单舞台、下半页内容 | Web Experience Task 5 |
| 可访问性、reduced motion、视觉回归 | Web Experience Task 5、Task 6 |
| 双容器、Render 私有 API、单实例磁盘 | Deployment Task 1、Task 2 |
| 六类 CI gate、main-only deploy、冒烟与回滚 | Deployment Task 3 至 Task 6 |

矩阵中的每一项都有 Red 测试或可重复的构建/冒烟门禁；后续演进项不进入任何实施任务。

## 全局不变量

- 不修改 `StateEstimator`、`StateMemoryBank`、`InterventionPolicy` 或核心 Pydantic 契约的行为。
- 浏览器不提交 `SignalEvent`、`ContextSnapshot` 或任何真实访客信号。
- 每次 API 请求使用新的内存记忆库，不跨请求保留状态。
- 三场景顺序固定，写入前基线固定验证为 `0.50, 0.50, 0.70`。
- API 或契约失败时 UI 进入 `unavailable`，不得显示静态成功结果。
- Web 在 SQLite/本地媒体阶段保持单实例。
- 每个任务先运行 Red，再写最小实现，再运行 Green，最后才重构和提交。
- 不提交数据库、上传文件、环境文件、构建缓存或 `.superpowers/`。

## 阶段完成门禁

每一阶段完成时运行其计划中的定向检查。整个路线图完成时必须重新运行：

```bash
uv run pytest
uv run mypy
uv run ruff check .
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run test
npm --prefix web run build
npm --prefix web run test:e2e
git diff --check main...HEAD
```

预期：所有命令退出码为 0；Git 审计不包含密钥、数据库、上传内容或缓存。

## 提交序列

计划中的提交按以下主题保持小而可回滚：

1. `chore: import SenseOrder web workspace`
2. `test: establish web quality baseline`
3. `feat: persist website media through storage adapter`
4. `style: extract SenseOrder design tokens`
5. `feat: expose authenticated SenseEngine demo API`
6. `chore: publish SenseEngine OpenAPI contract`
7. `feat: proxy validated demo runs through Next.js`
8. `feat: add SenseEngine homepage preview`
9. `feat: add responsive State Loop experience`
10. `test: cover web experience end to end`
11. `build: containerize SenseOrder web and API`
12. `ci: add verification and Render deployment workflow`

每个提交前均运行对应定向测试和格式检查；最终提交前运行全量门禁。
