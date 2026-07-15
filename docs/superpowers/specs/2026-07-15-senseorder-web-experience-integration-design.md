# SenseOrder 官网与 SenseEngine Web 体验融合设计规格

**日期：** 2026-07-15

**状态：** 已提交，待用户复核

**适用系统：** SenseEngine / SenseOrder Website / Web Demo

**关联事项：** GitHub Issue #2

## 1. 目标

将现有序感科技官网与已验证的 SenseEngine 状态循环整合到一个仓库中，为非技术合作伙伴和潜在客户提供可直接理解、可重复运行的 Web 演示。

演示必须证明四件事：

1. 引擎在证据不足时会询问，而不是伪装确定性。
2. 引擎能把当前认知负荷与写入前历史基线比较，再给出低风险建议。
3. 引擎在深度专注且无需干预时会保持安静。
4. 页面展示的是固定模拟场景经过真实 SenseEngine 核心逻辑得到的结果，不读取或诊断访客本人。

本阶段采用单一仓库、Next.js 与 FastAPI 双服务部署。官网负责品牌表达、交互与同源 API；FastAPI 负责固定演示场景的编排，并复用现有 `StateEstimator`、`StateMemoryBank` 和 `InterventionPolicy`。

## 2. 设计原则

- **真实核心，固定输入：** 输入是三个代码内定义的模拟场景，结果必须来自现有 Python 核心，不在前端复制规则或硬编码成功结果。
- **概率优先：** UI 展示完整概率分布、总体置信度、缺失度和主要证据，不把概率结果改写为对访客的绝对标签。
- **写入前基线：** 每一步先读取历史基线，再保存当前估计，确保当前状态不抬高自身比较基准。
- **克制优先：** Ask、Suggest Break 和 Silence 均作为一等决策展示，尤其强调 Silence 是系统能力。
- **核心与展示隔离：** Web 展示代码不进入核心模型和策略；FastAPI 只做适配、编排与传输。
- **隐私边界明确：** 不请求访客电脑活动、日历、摄像头、麦克风、身份或其他真实信号，不创建会话或持久化演示状态。
- **失败必须诚实：** API 不可用时展示不可用状态，不使用静态样例冒充实时结果。

## 3. 范围

### 3.1 本阶段包含

- 将现有 `senseorder-web` 迁入本仓库的 `web/` 目录。
- 保留官网现有公开页面、内容管理、联系表单、SQLite 内容和媒体管理能力。
- 新增 FastAPI 演示编排 API、健康检查和服务间认证。
- 新增 Next.js 同源代理路由与运行时 Zod 校验。
- 在首页加入轻量真实引擎预览。
- 新增完整 `/experience` 沉浸式体验页面。
- 桌面端状态舞台与移动端单舞台轮播布局。
- OpenAPI 到 TypeScript 类型生成和契约漂移检查。
- Python、Web、契约、集成、浏览器、容器与部署后冒烟门禁。
- Render 双服务、SQLite/媒体持久磁盘和自动部署配置。

### 3.2 本阶段不包含

- 读取访客真实电脑活动、日历、传感器或身份数据。
- 允许访客构造或提交 `SignalEvent`、`ContextSnapshot` 或其他信号载荷。
- 用户账户、服务器会话、Cookie、演示历史、数据库写入或跨请求记忆。
- 模型训练、在线学习、个体长期基线或真实干预执行。
- 修改现有估计规则、记忆算法、策略优先级或核心数据契约。
- 将 FastAPI 与 Next.js 合并为同一进程或同一容器。
- 本阶段迁移 SQLite 到 PostgreSQL，或迁移媒体到对象存储。
- 将 `StateValidator` 纳入演示主循环。

## 4. 目标仓库结构

```text
SenseEngine/
├── .circleci/
│   └── config.yml
├── docs/
├── examples/
├── src/sense_engine/
│   ├── api/
│   │   ├── __init__.py
│   │   ├── app.py                 # FastAPI 应用、路由与异常边界
│   │   ├── demo_service.py        # 固定场景和一次完整状态循环
│   │   ├── schemas.py             # 公开演示请求/响应模型
│   │   └── security.py            # 服务间密钥校验
│   ├── core/
│   ├── memory/
│   └── policy/
├── tests/
│   ├── api/
│   └── integration/
├── Dockerfile.api
├── web/
│   ├── app/
│   │   ├── api/demo/run/route.ts  # 浏览器同源代理与公共限流
│   │   ├── experience/page.tsx
│   │   └── page.tsx
│   ├── components/
│   │   └── experience/
│   ├── lib/
│   │   ├── generated/
│   │   │   └── sense-engine-api.d.ts
│   │   └── sense-engine/
│   ├── public/uploads/.gitkeep
│   ├── Dockerfile
│   ├── package.json
│   └── package-lock.json
├── render.yaml
├── pyproject.toml
└── uv.lock
```

实现可在上述职责边界内拆分测试或样式文件；生产模块保持这些边界，不得把核心状态规则复制到 `web/`，也不得让 Python API 依赖 Next.js。

## 5. 官网迁移规则

### 5.1 导入内容

从现有 `/Users/woods/Desktop/序感科技/序感文档/senseorder-web` 导入源码、锁文件、公开静态资产、SQLite 初始化逻辑和现有文档。迁移后 `web/` 是官网唯一受版本控制的源目录，原目录不再作为构建或部署输入。

### 5.2 禁止导入

以下内容不得进入 SenseEngine Git 历史：

- `node_modules/`
- `.next/`
- `.env`、`.env.local` 及其他真实环境文件
- `data/*.db`、`data/*.db-*`
- `public/uploads/*`，仅保留 `.gitkeep`
- `.DS_Store`
- 本地 `.superpowers/` 视觉讨论产物

根 `.gitignore` 与 `web/.gitignore` 必须覆盖这些规则。迁移完成后用 Git 差异确认没有数据库、上传文件、构建缓存或密钥被跟踪。

### 5.3 样式治理

现有 `app/globals.css` 同时包含基础样式和多轮尾部覆盖。融合工作应先提取稳定的颜色、字体、间距、边框和布局 token，再添加体验页样式；不得继续通过文件末尾叠加全局修补规则。

只重构为支持本次页面所必需的相关样式，不对未触达页面进行无关视觉改版。现有品牌语言保持不变：深色工程网格、`#b8ff6d` 生物绿、青色状态信息和琥珀色干预信息共同构成多色但克制的系统界面。

## 6. 运行时架构

```text
Browser
  │ POST /api/demo/run (same origin, no request body)
  ▼
Next.js Web service
  │ public rate limit + 20s upstream timeout
  │ X-SenseEngine-Service-Key (server-only)
  ▼
FastAPI private service
  │ fixed scenarios → StateEstimator → StateMemoryBank → InterventionPolicy
  ▼
one all-or-nothing DemoRunResponse
```

### 6.1 进程边界

- Next.js 是唯一公开服务，提供官网页面、管理端、联系 API 和 `/api/demo/run`。
- FastAPI 是 Render 私有服务，不直接暴露给浏览器。
- Next.js 通过服务器环境变量中的私有 URL 访问 FastAPI。
- 两个服务独立构建、独立健康检查、独立容器化，不共享进程内状态。

### 6.2 单次请求生命周期

每个 FastAPI 演示请求创建新的 `StateMemoryBank` 和共享 UTC 时钟，在同一请求内依序运行三个场景。`generated_at` 在场景执行前读取一次共享时钟并规范化为 UTC。请求完成或失败后，内存对象失去引用，不跨请求复用。

执行顺序对每个场景固定为：

1. 构造固定的 `SignalEvent` 和 `ContextSnapshot`。
2. `StateEstimator.estimate(...)`。
3. `StateMemoryBank.get_baseline()`，读取写入前历史。
4. `StateMemoryBank.save_event(estimate)`。
5. `InterventionPolicy.decide_action(estimate, baseline)`。
6. 将场景说明、写入前基线、完整估计和完整干预加入响应。

任一步失败时整次请求失败，不返回部分步骤。

## 7. 固定演示场景

场景和顺序是 API v1 契约的一部分，不接受访客参数。

| 顺序 | `scenario.id` | 模拟证据 | 预期估计 | 写入前基线 | 预期动作 |
| --- | --- | --- | --- | --- | --- |
| 1 | `insufficient-evidence` | 无电脑活动、无日历上下文 | `confidence=0.40`、`cognitive_load=0.50` | `0.50` | `Ask` |
| 2 | `long-meeting` | 中性电脑活动、Meeting、90 分钟 | `confidence=0.80`、`cognitive_load=0.90` | `0.50` | `Suggest Break` |
| 3 | `deep-focus` | `typing_speed=High`、`mouse_movement_frequency=Low` | `confidence=0.85`、`cognitive_load=0.55` | `0.70` | `Silence` |

第三步前的 `0.70` 为前两次负荷 `(0.50 + 0.90) / 2`。三步写入后的最终基线为 `0.65`，即 `(0.50 + 0.90 + 0.55) / 3`。

API 测试必须验证实际结果，而非由生产代码直接填入这些预期值。场景工厂只描述模拟证据，估计与干预字段只能来自核心组件。

## 8. FastAPI 公共契约

### 8.1 端点

- `GET /health/live`：进程存活，不访问数据库或运行状态循环。
- `GET /health/ready`：验证应用已加载且核心组件可构造。
- `POST /v1/demo/run`：运行三个固定场景，不接收请求体。
- `GET /openapi.json`：在私有网络和 CI 中提供契约生成；生产浏览器不直接访问。

`POST /v1/demo/run` 需要请求头 `X-SenseEngine-Service-Key`。缺失或错误返回 `401`，不得泄露密钥或比较细节。

公开响应模型固定组合如下：

- `DemoRunResponse`：`schema_version: Literal["1.0"]`、`mode: Literal["simulation"]`、时区感知的 `generated_at`、`retention: Literal["none"]`、严格三个 `DemoStep` 和 `baseline_after`。
- `DemoStep`：`scenario`、`baseline_before`、现有 `StateEstimate`、现有 `Intervention`。
- `DemoScenario`：固定 ID、`sequence`、中文 `title`、中文 `description` 和只含字符串 `label/value` 的证据摘要。

`baseline_before` 和 `baseline_after` 必须是 0 到 1 之间的有限数。FastAPI 不启用面向浏览器的 CORS；跨服务访问只发生在 Render 私有网络。

### 8.2 成功响应

HTTP `200`，`Content-Type: application/json`，`Cache-Control: no-store`。为保持示例可读性，下方只展开 `steps[0]`；生产响应必须使用同一结构完整返回三个步骤：

```json
{
  "schema_version": "1.0",
  "mode": "simulation",
  "generated_at": "2026-07-15T08:00:00Z",
  "retention": "none",
  "steps": [
    {
      "scenario": {
        "id": "insufficient-evidence",
        "sequence": 1,
        "title": "证据不足",
        "description": "可用证据不足，系统应保留不确定性。",
        "evidence": [
          {"label": "电脑活动", "value": "未提供"},
          {"label": "日历上下文", "value": "未提供"}
        ]
      },
      "baseline_before": 0.5,
      "estimate": {
        "dimensions": {"cognitive_load": 0.5},
        "distribution": {
          "flow": 0.2,
          "friction": 0.2,
          "cognitive_overload": 0.2,
          "unknown": 0.4
        },
        "confidence": 0.4,
        "missingness": {
          "computer_activity": 1.0,
          "calendar_context": 1.0
        },
        "model_version": "state-estimator-rules-v0.1",
        "explanation": [
          "Available evidence does not strongly support a specific state."
        ]
      },
      "intervention": {
        "objective": "confirm-current-state",
        "action": {
          "type": "Ask",
          "channel": "user-prompt",
          "parameters": {}
        },
        "risk": {
          "level": "low",
          "rationale": "系统不确定当前状态，需要用户确认"
        },
        "reversibility": {
          "is_reversible": true,
          "method": "dismiss-prompt",
          "recovery_seconds": 0.0
        },
        "expected_effect": {"cognitive_load": 0.0}
      }
    }
  ],
  "baseline_after": 0.65
}
```

生产响应必须始终有且仅有三个 `steps`，按 `sequence=1,2,3` 排序。`estimate` 与 `intervention` 保留现有核心契约的 JSON 字段，不为前端另造简化业务模型。场景标题与证据摘要是固定演示文案，不包含原始访客数据。

### 8.3 错误响应

FastAPI 的可预期错误使用稳定、无内部细节的结构：

```json
{
  "error": {
    "code": "demo_unavailable",
    "message": "SenseEngine demo is temporarily unavailable."
  }
}
```

- 未认证：HTTP `401`，代码 `unauthorized`。
- 演示内部失败：HTTP `503`，代码 `demo_unavailable`。
- 非法方法或路由：使用 FastAPI 标准状态码，但生产日志仍不得记录密钥或原始请求体。

Next.js 代理把超时、网络失败、上游非 200、JSON 解析失败或 Zod 校验失败统一映射为 HTTP `503` 和公开代码 `demo_unavailable`。限流返回 HTTP `429`、代码 `rate_limited` 和整数 `retry_after_seconds`。浏览器永远看不到 FastAPI 私有 URL、堆栈或认证信息。

## 9. Next.js 同源代理

`POST /api/demo/run` 是浏览器唯一调用入口：

1. 不读取或转发浏览器请求体。
2. 应用进程内、全局固定窗口限流：每个 Web 实例每 60 秒最多接受 30 次运行，并且最多同时处理 4 次上游请求；超过任一限制返回 429。限流不以 IP、Cookie 或账户建立访客档案。
3. 从服务器环境变量读取 FastAPI 私有 URL 和服务密钥。
4. 向私有 FastAPI 发起无请求体 POST，并设置服务密钥。
5. 20 秒后中止上游请求。
6. 使用 Zod 验证完整成功响应，包括三个场景 ID、顺序和关键核心字段。
7. 只把通过校验的 JSON 返回浏览器，并设置 `Cache-Control: no-store`。

限流状态只存在于当前 Web 进程，重启即清空。429 响应同时设置标准 `Retry-After` 头和相同秒数的 `retry_after_seconds`。当前部署限定单实例，因此行为明确；未来扩展多实例时改为共享限流服务，不能假定进程内计数全局一致。

## 10. TypeScript 契约与运行时校验

- FastAPI/Pydantic 生成的 OpenAPI 是跨服务静态类型的唯一来源。
- `openapi-typescript` 生成并提交 `web/lib/generated/sense-engine-api.d.ts`。
- Web 业务代码从生成类型派生 `DemoRunResponse`，不手写同名 TypeScript 接口。
- Zod schema 负责不可信网络响应的运行时校验；生成类型不能替代运行时校验。
- CI 重新生成 OpenAPI 和 TypeScript 类型，若 Git 差异非空则契约门禁失败。
- 契约测试用 FastAPI 实际响应通过 Zod 校验，防止生成类型与运行时 schema 各自正确但彼此漂移。

## 11. Web 体验设计

### 11.1 全站导航与首页

- 公共导航新增“体验”，链接 `/experience`；移动菜单和页脚探索链接同步更新。
- 首页主视觉保持“序感科技 / SENSEORDER”为第一视口主信号，不改成营销式独立落地页。
- 现有静态 State Vector 区域升级为 `State Loop Preview`。
- Preview 初始只展示可运行状态和隐私边界，不显示伪装成实时结果的固定数字。
- 用户主动运行后调用 `/api/demo/run`；成功时默认展示第二个“长会议”结果的负荷、写入前基线、置信度和 Suggest Break，并提供“进入完整体验”链接。
- Preview 的所有成功数值来自 API 响应；失败时显示不可用与重试，不保留上一次成功结果冒充新运行。

### 11.2 `/experience` 桌面端

第一视口就是实际工具，不增加独立营销 Hero。页面保留下一节内容提示，并包含：

- 简短标题：“体验一次被理解，也体验一次不被打扰。”
- “运行状态闭环”主按钮和“仅使用固定模拟场景”说明。
- 左侧三场景轨道，展示当前步骤与简短结果。
- 中央状态估计：认知负荷、置信度、四项概率分布和主要证据。
- 右侧干预：动作、中文风险理由、历史基线、风险等级、可逆性和无保留说明。
- 底部 Perceive → Estimate → Remember → Decide 进度。

成功响应一次性到达后，客户端按 1、2、3 顺序揭示结果；揭示动画只是展示节奏，不代表三次网络调用。用户可在已揭示场景间切换。重新运行会清除旧成功状态并发起新的完整请求。

### 11.3 `/experience` 移动端

移动端采用已批准的方案 A“单舞台 + 结果底栏”，不压缩桌面三栏：

- 一屏只显示一个场景、一个核心状态和一个干预。
- 顶部显示 `1 / 3`、`2 / 3`、`3 / 3` 和场景名称。
- 中央优先显示认知负荷或置信度主指标，概率和证据按当前场景组织。
- 干预结果从底部结果区呈现，包含历史基线和简短安全理由。
- “查看下一场景”按钮推进本地已返回结果；第三步变为“重新运行”。
- 触控目标不小于 44×44 CSS 像素，文本不溢出，结果面板不遮挡主指标或导航。

### 11.4 首屏下方内容

完整体验页依次包含：

1. 三项决策解释：Ask、Suggest Break、Silence 为什么成立。
2. State Loop 解剖：Perceive、Estimate、Remember、Decide 四步数据流。
3. 信任边界：“这是模拟，不是诊断”，并列明不读取真实设备、不保留访客状态、不会执行真实干预。
4. 设计伙伴 CTA：链接现有 `/contact`，不新增另一套线索表单。

不得在页面中展示内部 API URL、服务密钥、堆栈、原始信号 JSON 或面向开发者的操作说明。

## 12. UI 状态、错误与可访问性

### 12.1 状态机

客户端只有四个顶层状态：

```text
idle → running → success
          └────→ unavailable
unavailable → running (retry)
success → running (rerun)
```

- `idle`：说明固定模拟和隐私边界，等待主动运行。
- `running`：立即显示处理进度；超过 2 秒后增加“正在唤醒 SenseEngine”提示。
- `success`：只在 Zod 验证完整三步响应后进入。
- `unavailable`：20 秒浏览器超时、代理错误、限流或验证失败；显示简短原因与重试。

不得进入“部分成功”状态，也不得在错误时用页面内常量填充 Ask、Suggest Break 或 Silence。

### 12.2 可访问性

- 状态变化和当前结果使用克制的 `aria-live` 区域播报。
- 场景轨道使用语义按钮，暴露当前项与禁用状态；键盘可完成运行、切换、下一步和重试。
- 不只用颜色表达概率、风险或状态，所有条形图同时显示文本和值。
- 错误后焦点移到错误摘要；点击重试后焦点回到运行状态标题，成功后移到第一个结果标题。
- 尊重 `prefers-reduced-motion`：关闭自动平移、数字滚动和结果底栏位移动画，保留即时状态变化。
- 页面必须通过桌面和移动端无水平溢出、无文本遮挡和无交互重叠检查。

## 13. 安全、隐私与日志

- 浏览器不得获得 `SENSE_ENGINE_PRIVATE_URL` 或 `SENSE_ENGINE_SERVICE_KEY`；变量不得使用 `NEXT_PUBLIC_` 前缀。
- 服务密钥使用恒定时间比较，FastAPI 与 Web 从同一 Render secret group 注入。
- 演示请求没有用户可控的信号载荷，从架构上消除任意事件注入。
- 响应设置 `no-store`；演示数据不写 SQLite、文件、缓存或分析事件。
- 应用日志只记录时间、服务、路由、状态码、耗时和匿名错误代码。
- 禁止记录请求体、响应体、IP 地址、服务密钥、私有 URL和堆栈到公开日志。
- 服务器内部可以保留不含请求数据的异常类别用于运维；生产响应始终使用通用错误。
- 演示只构造声明式 `Intervention`，不得执行通知、日历修改、设备控制或其他外部动作。

## 14. SQLite 与媒体持久化

现有官网的 CMS、线索和设置继续使用 SQLite。当前阶段因此对 Web 服务作以下约束：

- Render Web 服务严格为单实例，避免多个本地 SQLite 副本和文件锁语义分叉。
- 挂载持久磁盘，`DATABASE_PATH` 指向磁盘内绝对路径。
- 上传媒体不再写入容器临时 `public/uploads`；新增存储抽象，将文件写入持久磁盘媒体目录。
- 新增受控媒体读取路由，通过数据库记录解析文件，校验文件名并返回正确 MIME 类型和缓存头。
- 上传、删除和读取都使用同一存储抽象，避免数据库元数据与文件操作分叉。
- 备份和恢复同时覆盖 SQLite 数据库与媒体目录。

这一方案适合当前单实例演示和 CMS。需要水平扩展时，先迁移 PostgreSQL 与对象存储，再提升 Web 实例数；不得在 SQLite 仍是本地文件时直接多实例扩容。

## 15. Render 部署

`render.yaml` 定义：

构建与运行时固定为 Python 3.12 和 Node.js 22 LTS。Python 使用提交的 `uv.lock` 与 `uv sync --frozen`；Web 使用提交的 `package-lock.json` 与 `npm ci`。FastAPI 生产依赖显式包含 ASGI server，不依赖开发环境中的隐式安装。

### 15.1 Web 服务

- 类型：公开 Web service。
- 根目录：`web/`。
- 构建：`npm ci` 后以 `DATABASE_PATH=/tmp/senseorder-build.db` 执行 Next.js production build。构建阶段不能读取未挂载的持久磁盘，临时数据库不进入产物或 Git。
- 启动：Next.js production server，监听 Render 提供的端口。
- 健康检查：`/api/health`，只检查 Web 进程，不依赖 FastAPI，以区分 Web 与上游故障。
- 持久磁盘：1 GB，挂载到 `/var/data`；SQLite 为 `/var/data/senseorder.db`，媒体目录为 `/var/data/media`。
- 单实例：在迁移 PostgreSQL/对象存储前保持不变。

### 15.2 FastAPI 服务

- 类型：Private service。
- 根目录：仓库根。
- 构建：安装锁定的 Python 生产依赖。
- 启动：ASGI server 运行 `sense_engine.api.app:app`。
- 健康检查：`/health/ready`。
- 无持久磁盘，无数据库，无跨请求会话。

### 15.3 环境变量

Web 使用以下环境变量：

- `DATABASE_PATH`
- `MEDIA_ROOT`
- `SENSE_ENGINE_PRIVATE_URL`
- `SENSE_ENGINE_SERVICE_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- `NODE_ENV=production`

FastAPI 使用以下环境变量：

- `SENSE_ENGINE_SERVICE_KEY`
- `SENSE_ENGINE_ENV=production`
- `LOG_LEVEL=info`

部署配置只声明变量名和生成策略，不提交真实值。

## 16. CircleCI 与发布门禁

CircleCI 工作流分为可并行的验证任务，并在合并到 `main` 后才允许部署：

1. **Python gate**：安装依赖、完整 pytest、strict mypy、Ruff。
2. **Web gate**：确定性安装、ESLint、TypeScript、组件/单元测试和 production build。
3. **Contract gate**：导出 OpenAPI、生成 TypeScript 类型、断言工作树无生成差异。
4. **Integration gate**：启动 FastAPI，验证认证、固定三步、基线 `0.50 → 0.50 → 0.70`、动作 `Ask → Suggest Break → Silence`，再通过 Next.js 代理验证 Zod。
5. **Browser gate**：桌面和移动端 Playwright，覆盖 idle、running、success、unavailable、重试、轮播、键盘和 reduced-motion。
6. **Container gate**：分别构建 Web 和 API 镜像，运行健康检查与最小容器冒烟。
7. **Deploy**：只在 `main` 且所有门禁通过后触发 Render 部署。
8. **Post-deploy smoke**：验证 Web 健康、FastAPI 就绪以及公开代理的一次完整三步响应。

部署任务在发布前记录 Web 与 FastAPI 的上一成功 deploy ID。部署后冒烟失败时，流水线标记发布失败，调用 Render API 回滚两个服务到各自记录的版本，并再次执行健康检查；回滚失败必须保持红灯并输出不含密钥的人工处置链接。功能分支和 Pull Request 永不部署生产。

## 17. 测试策略

### 17.1 Python

- 固定场景工厂生成预期 `SignalEvent` 和 `ContextSnapshot`。
- 演示服务使用写入前基线，按顺序调用现有三组件。
- 每次请求从空记忆开始，两次请求互不影响。
- 成功响应严格包含三个步骤和最终基线 `0.65`。
- 无效服务密钥返回 401。
- 任一步组件异常返回全量 503，不泄露部分结果。
- OpenAPI 包含完整 `DemoRunResponse`。

### 17.2 Web

- Zod 接受真实 FastAPI 成功 fixture，拒绝缺步骤、错顺序、非有限数、未知动作和缺安全字段。
- 代理不读取访客请求体，正确注入服务器密钥，并映射超时、上游错误、解析错误和限流。
- 首页 Preview 成功只使用 API 数值；失败不显示硬编码结果。
- 体验页四状态转换和重新运行时旧状态清理正确。
- 移动端下一场景只切换本地完整响应，不额外发起请求。

### 17.3 端到端与视觉

- 一次完整运行出现 Ask、Suggest Break 和 Silence，顺序和基线正确。
- 不可用场景中页面从不展示伪造成功结果。
- 390×844、768×1024、1440×900 和宽屏视口无重叠、溢出或首屏截断。
- 截图回归覆盖首页 Preview、体验桌面状态和移动端三步关键状态。
- 检查浏览器控制台无错误，所有 API 请求使用同源 URL。
- 本地内置浏览器若不可用，使用项目 Playwright 作为回退，并在验证记录中如实注明工具限制。

### 17.4 迁移与范围

- Git 审计确认禁入目录和秘密未被跟踪。
- 现有官网公开路由、管理端、联系提交和媒体 CRUD 回归通过。
- 现有 SenseEngine 核心测试保持通过。
- 核心模型、估计器、记忆算法和策略逻辑没有为 Web 演示而改写。

## 18. 验收标准

- 用户从首页可以主动运行真实 SenseEngine Preview，并进入 `/experience`。
- `/experience` 在桌面和移动端清楚呈现三个连续场景，而不是三个孤立静态样例。
- 三场景实际输出依次为 Ask、Suggest Break、Silence；写入前基线依次为 `0.50`、`0.50`、`0.70`。
- 页面显示概率分布、置信度、认知负荷、解释、安全理由和可逆性。
- 页面明确说明模拟、非诊断、不读取真实设备且请求后不保留状态。
- API 故障、超时、限流或契约错误绝不回退为伪造结果。
- 浏览器只调用 Next.js 同源路由，FastAPI 私有 URL 与密钥不出现在客户端资源或日志中。
- OpenAPI 生成类型、Zod 运行时校验和端到端响应保持一致。
- Python、Web、契约、集成、浏览器和容器门禁全部通过。
- Render 从 `main` 自动部署，部署后健康与完整演示冒烟通过。
- SQLite 和媒体在重启后保持，Web 在迁移 PostgreSQL/对象存储前维持单实例。

## 19. 后续演进

本阶段上线并获得使用反馈后，再按证据决定：

1. PostgreSQL 与对象存储迁移，解除 Web 单实例限制。
2. 共享限流、可观测性和多区域部署。
3. 在明确授权和治理设计下引入真实信号接入。
4. 独立设计 `StateValidator` 与评估闭环。

这些事项不进入本阶段实施计划。
