# SenseOrder Web Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让首页和 `/experience` 通过 Next.js 同源代理运行真实 SenseEngine 三场景演示，并在桌面与移动端可靠呈现 Ask、Suggest Break 和 Silence。

**Architecture:** FastAPI OpenAPI 生成静态 TypeScript 类型，Zod 对每次上游响应做运行时验证。Next.js Route Handler 负责无身份全局限流、服务密钥和错误收敛；React 客户端只管理 `idle/running/success/unavailable` 状态以及已完整返回的三步本地浏览。

**Tech Stack:** Next.js 16、React 19、TypeScript 5、Zod 4、openapi-typescript、Vitest、Testing Library、Playwright、Lucide React、CSS Modules

**执行技能：** 实施 UI 任务前读取 `build-web-apps:frontend-app-builder` 和 `build-web-apps:react-best-practices`；浏览器验收前读取 `build-web-apps:frontend-testing-debugging`。

---

## 文件结构

**创建：**

- `web/lib/generated/sense-engine-api.d.ts`：OpenAPI 生成类型。
- `web/lib/sense-engine/types.ts`：从生成类型派生公开别名。
- `web/lib/sense-engine/schema.ts`：Zod 网络边界。
- `web/lib/sense-engine/rate-limit.ts`：进程内全局限流和并发控制。
- `web/lib/sense-engine/upstream.ts`：20 秒 FastAPI 客户端。
- `web/app/api/demo/run/route.ts`：浏览器同源入口。
- `web/app/api/health/route.ts`：Web 进程健康检查。
- `web/hooks/use-demo-run.ts`：客户端状态机、2 秒提示和 20 秒超时。
- `web/components/experience/StateLoopPreview.tsx`：首页轻量结果。
- `web/components/experience/ExperienceRunner.tsx`：完整体验控制器。
- `web/components/experience/ScenarioRail.tsx`：桌面场景轨道。
- `web/components/experience/EstimatePanel.tsx`：概率、负荷与证据。
- `web/components/experience/InterventionPanel.tsx`：动作与安全声明。
- `web/components/experience/MobileResultSheet.tsx`：移动端结果和下一步。
- `web/components/experience/ExperienceSections.tsx`：解释、Loop、信任与 CTA。
- `web/components/experience/experience.module.css`：响应式布局。
- `web/app/experience/page.tsx`：体验页面。
- `web/tests/lib/sense-engine-schema.test.ts`：Zod 契约测试。
- `web/tests/lib/rate-limit.test.ts`：限流测试。
- `web/tests/api/demo-route.test.ts`：同源代理测试。
- `web/tests/hooks/use-demo-run.test.tsx`：状态机测试。
- `web/tests/components/state-loop-preview.test.tsx`：首页 Preview 测试。
- `web/tests/components/experience-runner.test.tsx`：完整体验测试。
- `web/e2e/state-loop.spec.ts`：桌面/移动/错误 E2E。
- `web/e2e/site-regression.spec.ts`：现有公开站点、联系表单、管理端和媒体回归。
- `web/playwright.config.ts`：浏览器测试配置。

**修改：**

- `web/package.json`、`web/package-lock.json`：生成、单测和 E2E 工具。
- `web/app/page.tsx`：用真实 Preview 替换静态 StateField。
- `web/components/SiteHeader.tsx`：新增“体验”。
- `web/components/SiteFooter.tsx`：新增体验入口。
- `web/app/globals.css`：仅删除被 CSS Module 取代的旧 StateField 规则，不追加体验覆盖。

### Task 1: 生成 TypeScript 类型并建立 Zod 契约

- [ ] **Step 1: 安装契约生成工具并增加脚本**

Run: `npm --prefix web install --save-dev openapi-typescript@7.8.0`

在 `web/package.json` 加入：

```json
{
  "generate:api": "openapi-typescript ../contracts/sense-engine-openapi.json -o lib/generated/sense-engine-api.d.ts",
  "check:api": "npm run generate:api && git diff --exit-code -- lib/generated/sense-engine-api.d.ts"
}
```

Run: `npm --prefix web run generate:api`

Expected: 生成 `web/lib/generated/sense-engine-api.d.ts`。

- [ ] **Step 2: 从生成文件派生唯一静态类型**

创建 `web/lib/sense-engine/types.ts`：

```ts
import type { paths } from "@/lib/generated/sense-engine-api";

type DemoPost = paths["/v1/demo/run"]["post"];

export type DemoRunResponse = DemoPost["responses"][200]["content"]["application/json"];
export type DemoStep = DemoRunResponse["steps"][number];
export type DemoAction = DemoStep["intervention"]["action"]["type"];

export type DemoPublicError = {
  error: {
    code: "demo_unavailable" | "rate_limited";
    message: string;
    retry_after_seconds?: number;
  };
};
```

- [ ] **Step 3: 编写 Zod Red 测试**

创建 `web/tests/lib/sense-engine-schema.test.ts`。从真实 Python 导出的 fixture 读取完整三步响应，再断言严格结构：

```ts
// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { demoRunSchema } from "@/lib/sense-engine/schema";

const validResponse = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "../contracts/demo-response.json"), "utf8"),
);

expect(demoRunSchema.parse(validResponse).steps).toHaveLength(3);
expect(() => demoRunSchema.parse({ ...validResponse, steps: validResponse.steps.slice(0, 2) })).toThrow();
expect(() => demoRunSchema.parse({
  ...validResponse,
  steps: [validResponse.steps[1], validResponse.steps[0], validResponse.steps[2]],
})).toThrow();
expect(() => demoRunSchema.parse({ ...validResponse, baseline_after: Number.NaN })).toThrow();
expect(() => demoRunSchema.parse({
  ...validResponse,
  steps: validResponse.steps.map((step, index) => index === 0
    ? { ...step, intervention: { ...step.intervention, action: { ...step.intervention.action, type: "Notify" } } }
    : step),
})).toThrow();
```

- [ ] **Step 4: 运行测试确认 Red**

Run: `npm --prefix web run test -- tests/lib/sense-engine-schema.test.ts`

Expected: FAIL，因为 `demoRunSchema` 不存在。

- [ ] **Step 5: 实现严格 Zod schema**

创建 `web/lib/sense-engine/schema.ts`：

```ts
import { z } from "zod";
import type { DemoRunResponse } from "@/lib/sense-engine/types";

const finiteProbability = z.number().finite().min(0).max(1);
const finiteNumber = z.number().finite();

const estimateSchema = z.object({
  dimensions: z.record(z.string().min(1), finiteNumber),
  distribution: z.record(z.string().min(1), finiteProbability),
  confidence: finiteProbability,
  missingness: z.record(z.string().min(1), finiteProbability),
  model_version: z.string().min(1),
  explanation: z.array(z.string().min(1)).min(1),
}).strict();

const interventionSchema = z.object({
  objective: z.string().min(1),
  action: z.object({
    type: z.enum(["Ask", "Suggest Break", "Silence"]),
    channel: z.string().min(1),
    parameters: z.record(z.string(), z.json()),
  }).strict(),
  risk: z.object({
    level: z.enum(["low", "medium", "high"]),
    rationale: z.string().min(1),
  }).strict(),
  reversibility: z.object({
    is_reversible: z.boolean(),
    method: z.string().min(1).nullable(),
    recovery_seconds: finiteNumber.min(0).nullable(),
  }).strict(),
  expected_effect: z.record(z.string().min(1), finiteNumber),
}).strict();

const scenario = (
  id: "insufficient-evidence" | "long-meeting" | "deep-focus",
  sequence: 1 | 2 | 3,
) => z.object({
  id: z.literal(id),
  sequence: z.literal(sequence),
  title: z.string().min(1),
  description: z.string().min(1),
  evidence: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) }).strict()).min(1),
}).strict();

const step = (id: Parameters<typeof scenario>[0], sequence: Parameters<typeof scenario>[1]) =>
  z.object({
    scenario: scenario(id, sequence),
    baseline_before: finiteProbability,
    estimate: estimateSchema,
    intervention: interventionSchema,
  }).strict();

export const demoRunSchema: z.ZodType<DemoRunResponse> = z.object({
  schema_version: z.literal("1.0"),
  mode: z.literal("simulation"),
  generated_at: z.iso.datetime({ offset: true }),
  retention: z.literal("none"),
  steps: z.tuple([
    step("insufficient-evidence", 1),
    step("long-meeting", 2),
    step("deep-focus", 3),
  ]),
  baseline_after: finiteProbability,
}).strict();
```

- [ ] **Step 6: 运行契约与类型检查确认 Green**

Run: `npm --prefix web run test -- tests/lib/sense-engine-schema.test.ts`

Run: `npm --prefix web run typecheck`

Expected: 均退出码为 0。

- [ ] **Step 7: 提交生成类型和 Zod 边界**

```bash
git add web/package.json web/package-lock.json web/lib/generated web/lib/sense-engine web/tests/lib/sense-engine-schema.test.ts
git commit -m "chore: generate SenseEngine web contract"
```

### Task 2: 实现限流、上游客户端和同源代理

- [ ] **Step 1: 编写限流 Red 测试**

创建 `web/tests/lib/rate-limit.test.ts`，用可注入 `now` 覆盖 30 次/60 秒、4 并发、release 和窗口重置：

```ts
const limiter = new DemoRateLimiter({ limit: 30, windowMs: 60_000, concurrency: 4, now: () => now });
const leases = Array.from({ length: 4 }, () => limiter.acquire());
expect(leases.every((lease) => lease.ok)).toBe(true);
expect(limiter.acquire()).toMatchObject({ ok: false, reason: "concurrency" });
leases[0].ok && leases[0].release();
expect(limiter.acquire().ok).toBe(true);
```

- [ ] **Step 2: 运行限流测试确认 Red**

Run: `npm --prefix web run test -- tests/lib/rate-limit.test.ts`

Expected: FAIL，因为 `DemoRateLimiter` 不存在。

- [ ] **Step 3: 实现限流器**

创建 `web/lib/sense-engine/rate-limit.ts`。`acquire()` 返回判别联合：

```ts
type Lease = { ok: true; release: () => void } | {
  ok: false;
  reason: "window" | "concurrency";
  retryAfterSeconds: number;
};
```

类维护 `windowStartedAt`、`accepted` 和 `active`。窗口过期时把 `accepted` 清零；成功获取先增加两项，`release` 通过局部 `released` 布尔值保证幂等并只减少 `active`。窗口失败的重试秒数为 `ceil((windowMs - elapsed)/1000)`，并发失败固定为 1 秒。

- [ ] **Step 4: 运行限流测试确认 Green**

Run: `npm --prefix web run test -- tests/lib/rate-limit.test.ts`

Expected: 全部通过。

- [ ] **Step 5: 编写代理 Red 测试**

创建 `web/tests/api/demo-route.test.ts`，mock `global.fetch` 和模块级 limiter，直接调用 `POST(new Request("http://local/api/demo/run", { method: "POST", body: "ignored" }))`，断言：

- 浏览器 body 不出现在上游调用。
- 上游 URL 来自 `SENSE_ENGINE_PRIVATE_URL`。
- 上游请求包含 `X-SenseEngine-Service-Key`，但公开响应不包含。
- 合法响应经 Zod 返回 200 与 `no-store`。
- 上游非 200、非法 JSON、错 schema 和 AbortError 均返回通用 503。
- 限流返回 429，同时包含 `Retry-After` 和 `retry_after_seconds`。

关键失败断言：

```ts
expect(response.status).toBe(503);
const payload = await response.json();
expect(payload).toEqual({
  error: {
    code: "demo_unavailable",
    message: "SenseEngine demo is temporarily unavailable.",
  },
});
expect(JSON.stringify(payload)).not.toContain("private.internal");
```

- [ ] **Step 6: 运行代理测试确认 Red**

Run: `npm --prefix web run test -- tests/api/demo-route.test.ts`

Expected: FAIL，因为 route 和 upstream client 不存在。

- [ ] **Step 7: 实现 20 秒上游客户端**

创建 `web/lib/sense-engine/upstream.ts`：读取非公开环境变量，使用 `AbortSignal.timeout(20_000)`，POST 到 `${baseUrl}/v1/demo/run`，只发送认证头，不设置 body。非 200 抛出固定 `DemoUpstreamError`；成功时 `demoRunSchema.parse(await response.json())`。错误对象不得保存 URL、响应体或密钥。

核心实现：

```ts
export async function runDemoUpstream(fetcher: typeof fetch = fetch) {
  const baseUrl = process.env.SENSE_ENGINE_PRIVATE_URL;
  const serviceKey = process.env.SENSE_ENGINE_SERVICE_KEY;
  if (!baseUrl || !serviceKey) throw new DemoUpstreamError();
  const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/v1/demo/run`, {
    method: "POST",
    headers: { "X-SenseEngine-Service-Key": serviceKey },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new DemoUpstreamError();
  return demoRunSchema.parse(await response.json());
}
```

- [ ] **Step 8: 实现公开 Route Handler**

创建 `web/app/api/demo/run/route.ts`，模块级 limiter 配置 `30/60_000/4`。`POST` 不调用 `request.json()` 或 `request.text()`，获取 lease 后调用 `runDemoUpstream()`，并在 `finally` release。成功和错误响应都设置 `Cache-Control: no-store`。429 使用 `Retry-After`。

创建 `web/app/api/health/route.ts`：

```ts
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "alive" }, { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 9: 运行代理与静态检查确认 Green**

Run: `npm --prefix web run test -- tests/lib/rate-limit.test.ts tests/api/demo-route.test.ts`

Run: `npm --prefix web run typecheck`

Run: `npm --prefix web run lint`

Expected: 均退出码为 0。

- [ ] **Step 10: 提交代理**

```bash
git add web/app/api/demo web/app/api/health web/lib/sense-engine web/tests/api web/tests/lib/rate-limit.test.ts
git commit -m "feat: proxy validated demo runs through Next.js"
```

### Task 3: 实现客户端四状态机

- [ ] **Step 1: 编写 hook Red 测试**

创建 `web/tests/hooks/use-demo-run.test.tsx`，使用 `renderHook`、`act` 和 fake timers 覆盖：

- 初始 `idle` 且无 data/error。
- 运行立即为 `running`，2 秒后 `isWaking=true`。
- 合法三步响应进入 `success`。
- 429、503、fetch reject 和 20 秒超时进入 `unavailable`。
- retry 先清理旧错误和成功数据。
- unmount 中止请求，不产生 state update warning。

核心断言：

```ts
expect(result.current.status).toBe("running");
await act(async () => vi.advanceTimersByTimeAsync(2_000));
expect(result.current.isWaking).toBe(true);
await act(async () => vi.advanceTimersByTimeAsync(18_000));
expect(result.current.status).toBe("unavailable");
expect(result.current.data).toBeNull();
```

- [ ] **Step 2: 运行 hook 测试确认 Red**

Run: `npm --prefix web run test -- tests/hooks/use-demo-run.test.tsx`

Expected: FAIL，因为 hook 不存在。

- [ ] **Step 3: 实现状态机 hook**

创建 `web/hooks/use-demo-run.ts`，导出：

```ts
export type DemoStatus = "idle" | "running" | "success" | "unavailable";

export type DemoRunState = {
  status: DemoStatus;
  isWaking: boolean;
  data: DemoRunResponse | null;
  errorCode: "demo_unavailable" | "rate_limited" | null;
  run: () => Promise<void>;
};
```

`run()` 创建浏览器侧 `AbortController`、2 秒 waking timer 和 20 秒 abort timer，请求 `/api/demo/run`。只有 `response.ok` 且 `demoRunSchema.parse` 成功才设置 success；任何错误先清空 data，再设置 unavailable。`finally` 清理两个 timer 和 controller ref。组件 unmount 时 abort 并清理。

- [ ] **Step 4: 运行 hook 测试确认 Green**

Run: `npm --prefix web run test -- tests/hooks/use-demo-run.test.tsx`

Expected: 全部通过，无 React act warning。

- [ ] **Step 5: 提交状态机**

```bash
git add web/hooks/use-demo-run.ts web/tests/hooks/use-demo-run.test.tsx
git commit -m "feat: add SenseEngine demo client state machine"
```

### Task 4: 升级首页真实 Preview

- [ ] **Step 1: 编写 Preview Red 测试**

创建 `web/tests/components/state-loop-preview.test.tsx`，mock `useDemoRun`，覆盖：

- idle 只显示运行按钮和“固定模拟场景”，不显示 `0.90` 或 Suggest Break。
- running 显示进度，isWaking 后显示“正在唤醒 SenseEngine”。
- success 从 `steps[1]` 显示基线、负荷、置信度和动作。
- unavailable 不显示旧结果，错误摘要带 `role="alert"`，重试可调用 run。
- 存在指向 `/experience` 的“进入完整体验”。

- [ ] **Step 2: 运行 Preview 测试确认 Red**

Run: `npm --prefix web run test -- tests/components/state-loop-preview.test.tsx`

Expected: FAIL，因为 `StateLoopPreview` 不存在。

- [ ] **Step 3: 实现 Preview**

创建 client component `StateLoopPreview.tsx`。idle、running、unavailable 使用独立语义分支；success 只从 `data.steps[1]` 派生：

```ts
const step = data.steps[1];
const load = step.estimate.dimensions.cognitive_load;
const confidence = step.estimate.confidence;
const action = step.intervention.action.type;
```

使用 Lucide `Play`, `RefreshCw`, `ArrowUpRight`，按钮提供可见文本和 focus ring。状态文案放在 `aria-live="polite"` 区域。不得定义包含 `0.90`、`0.80`、`Suggest Break` 的生产常量。

在 `web/app/page.tsx` 用 `<StateLoopPreview />` 替换 `<StateField />`，保留品牌主标题和下一节提示。删除不再引用的 `StateField` import；只有确认其他页面无引用后才删除组件文件。

- [ ] **Step 4: 运行 Preview、lint 和 build**

Run: `npm --prefix web run test -- tests/components/state-loop-preview.test.tsx`

Run: `npm --prefix web run lint`

Run: `DATABASE_PATH=/tmp/senseorder-experience-build.db npm --prefix web run build`

Expected: 均退出码为 0。

- [ ] **Step 5: 提交首页 Preview**

```bash
git add web/app/page.tsx web/components/experience/StateLoopPreview.tsx web/tests/components/state-loop-preview.test.tsx web/components/StateField.tsx
git commit -m "feat: add SenseEngine homepage preview"
```

### Task 5: 构建桌面和移动端完整体验

- [ ] **Step 1: 编写 ExperienceRunner Red 测试**

创建 `web/tests/components/experience-runner.test.tsx`，mock hook 返回固定完整响应，断言：

- idle 标题为“体验一次被理解，也体验一次不被打扰”，主按钮可运行。
- success 初始显示场景 1 的 Ask、`0.40` confidence 和 `0.50` baseline。
- 点击场景 2 显示 Suggest Break、`0.90` load、`0.50` baseline。
- 点击移动端“查看下一场景”只改变本地 index，不再次调用 run。
- 场景 3 显示 Silence 和 `0.70` baseline，按钮变为“重新运行”。
- unavailable 的 retry 后焦点回到运行状态标题。

- [ ] **Step 2: 运行组件测试确认 Red**

Run: `npm --prefix web run test -- tests/components/experience-runner.test.tsx`

Expected: FAIL，因为完整体验组件不存在。

- [ ] **Step 3: 实现专一展示组件**

按文件边界创建组件：

- `EstimatePanel` 只接收 `DemoStep`，展示 `cognitive_load`、`confidence`、四项 distribution 和 explanation；每条 bar 同时有 label 和两位小数值。
- `InterventionPanel` 只接收 `DemoStep`，展示 action、`risk.rationale`、baseline、risk level、reversibility 和 retention none。
- `ScenarioRail` 接收三个 step、activeIndex 和 `onSelect`，按钮设置 `aria-current`。
- `MobileResultSheet` 接收当前 step、index、`onNext` 和 `onRerun`，索引 0/1 显示“查看下一场景”，索引 2 显示“重新运行”。
- `ExperienceRunner` 拥有 activeIndex；每次新 success 重置为 0，重新运行先清理当前显示。

所有概率格式使用共享函数：

```ts
export function formatProbability(value: number) {
  return value.toFixed(2);
}
```

不要根据动作重新计算状态，也不要把英文 explanation 改写为诊断。

- [ ] **Step 4: 创建体验页面下半部分**

`ExperienceSections.tsx` 固定展示三项产品解释、State Loop 四步、信任边界和指向 `/contact` 的 CTA。固定文案可以描述演示设计，但不得冒充 API 运行结果。必须包含：

- “这是模拟，不是诊断。”
- “不读取真实电脑活动、日历、摄像头或麦克风。”
- “一次请求结束后不保留访客状态。”
- “不会执行真实通知或设备动作。”

创建 `web/app/experience/page.tsx`，设置页面 metadata，并组合 `<ExperienceRunner />` 与 `<ExperienceSections />`。

- [ ] **Step 5: 实现批准的响应式 CSS**

在 `experience.module.css` 使用共享 token。桌面 `min-width: 1024px` 为 `240px minmax(0, 1fr) 300px` 三列；平板为单列场景 tabs + 双列结果；移动 `max-width: 767px` 只显示单舞台和底部结果区。固定要求：

```css
.stage { min-height: 520px; }
.metricButton, .runButton, .nextButton { min-height: 44px; }
.distributionBar { min-width: 0; overflow: hidden; }
@media (prefers-reduced-motion: reduce) {
  .animatedValue, .resultSheet { transition: none; animation: none; }
}
```

结果区不得使用 fixed 定位遮挡导航；使用正常文档流或 sticky 且保留等高空间。卡片圆角不得超过 6px，不使用渐变球或装饰性大圆角容器。

- [ ] **Step 6: 更新导航与页脚**

在 `SiteHeader.tsx` 的公开 links 加入 `{ href: "/experience", label: "体验" }`，移动编号根据数组索引自动计算；联系入口编号随之变为 `06`。在 `SiteFooter.tsx` 的 Explore 加入 `/experience`。

- [ ] **Step 7: 运行组件与 Web 全量门禁**

Run: `npm --prefix web run test`

Run: `npm --prefix web run typecheck`

Run: `npm --prefix web run lint`

Run: `DATABASE_PATH=/tmp/senseorder-experience-build.db npm --prefix web run build`

Expected: 全部退出码为 0。

- [ ] **Step 8: 提交完整体验**

```bash
git add web/app/experience web/components/experience web/tests/components web/components/SiteHeader.tsx web/components/SiteFooter.tsx web/app/globals.css
git commit -m "feat: add responsive State Loop experience"
```

### Task 6: 浏览器端到端与视觉验收

- [ ] **Step 1: 安装并配置 Playwright**

Run: `npm --prefix web install --save-dev --save-exact @playwright/test@1.55.1`

`1.55.1` 修复了 Playwright 浏览器下载证书验证安全问题，因此不得回退到 `1.55.0`。

在 `web/package.json` 加入：

```json
{
  "test:e2e": "playwright test",
  "test:e2e:update": "playwright test --update-snapshots"
}
```

创建 `web/playwright.config.ts`，使用两个 webServer：FastAPI 端口 8000 与 Next.js 端口 3000；环境注入同一个测试服务密钥、私有 URL、临时 SQLite 与媒体路径。projects 包含 chromium desktop 和 mobile 390×844。

- [ ] **Step 2: 编写 E2E 测试**

创建 `web/e2e/state-loop.spec.ts`，覆盖：

```ts
test("runs the complete state loop", async ({ page }) => {
  await page.goto("/experience");
  await page.getByRole("button", { name: "运行状态闭环" }).click();
  await expect(page.getByRole("heading", { name: /证据不足/ })).toBeVisible();
  await expect(page.getByText("Ask", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /长会议过载/ }).click();
  await expect(page.getByText("Suggest Break", { exact: true })).toBeVisible();
  await expect(page.getByText("0.50", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /深度专注/ }).click();
  await expect(page.getByText("Silence", { exact: true })).toBeVisible();
  await expect(page.getByText("0.70", { exact: true })).toBeVisible();
});
```

另写 API 503 拦截测试，断言 unavailable 且页面不出现三个动作；移动项目用“查看下一场景”推进；reduced-motion 项目注入 media feature 并断言无动画。

创建 `web/e2e/site-regression.spec.ts`：

- 遍历 `/`、`/technology`、`/products`、`/insights`、`/about`、`/contact`，断言主区域可见且响应不为 4xx/5xx。
- 使用唯一邮箱提交联系表单，断言“信息已经收到。”，然后用测试管理员登录后台并确认线索出现。
- 登录 `/admin` 后进入媒体管理，使用 `setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64") })` 上传，断言 `/api/media/` 图片可读取，再删除并断言后台条目消失。
- 测试使用独立临时 SQLite 与 `MEDIA_ROOT`，结束后由 Playwright webServer teardown 删除，不接触开发数据库。

- [ ] **Step 3: 运行 E2E 确认 Green**

Run: `npm --prefix web run test:e2e`

Expected: desktop 与 mobile projects 全部通过。

- [ ] **Step 4: 截图与像素/布局检查**

为 390×844、768×1024、1440×900、1920×1080 保存 idle、success 场景 2 和 unavailable 截图。测试断言 `document.documentElement.scrollWidth === document.documentElement.clientWidth`，并用元素 bounding boxes 检查 header、主指标、结果面板和下一按钮无交叠。`ONE_PIXEL_PNG_BASE64` 固定为 `iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=`。

使用内置浏览器做补充检查；若出现已知连接错误，记录错误并使用 Playwright 截图与控制台检查完成验收，不得声称内置浏览器已通过。

- [ ] **Step 5: 提交 E2E**

```bash
git add web/package.json web/package-lock.json web/playwright.config.ts web/e2e web/tests
git commit -m "test: cover web experience end to end"
```

### Task 7: Web 阶段完整回归

- [ ] **Step 1: 运行契约漂移检查**

Run: `npm --prefix web run check:api`

Expected: 生成后 Git 无差异。

- [ ] **Step 2: 运行 Web 全量门禁**

Run: `npm --prefix web run test`

Run: `npm --prefix web run typecheck`

Run: `npm --prefix web run lint`

Run: `DATABASE_PATH=/tmp/senseorder-experience-build.db npm --prefix web run build`

Run: `npm --prefix web run test:e2e`

Expected: 全部退出码为 0。

- [ ] **Step 3: 运行 Python 回归和范围审计**

Run: `uv run pytest`

Run: `uv run mypy`

Run: `uv run ruff check .`

Run: `git diff --check main...HEAD`

Expected: 全部退出码为 0，核心行为没有为 UI 改写。
