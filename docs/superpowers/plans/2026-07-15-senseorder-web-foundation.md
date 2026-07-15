# SenseOrder Web Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 SenseOrder 官网安全迁入 `web/`，并建立可测试、可持久化媒体、可继续开发体验页的基线。

**Architecture:** 官网作为单仓库中的独立 Next.js workspace 运行，保留现有 SQLite CMS。媒体文件通过 `LocalMediaStorage` 写入 `MEDIA_ROOT`，公开读取经过数据库记录和受控路由；视觉 token 独立于历史全局样式，后续体验组件使用 token 和 CSS Modules。

**Tech Stack:** Next.js 16、React 19、TypeScript 5、SQLite、better-sqlite3、Vitest、Testing Library、Node.js 22、npm

---

## 文件结构

**创建：**

- `web/`：从现有官网导入的受版本控制源码。
- `tests/repository/test_web_workspace.py`：仓库级迁移边界测试。
- `web/vitest.config.ts`：Web 单元测试配置。
- `web/tests/setup.ts`：Testing Library matchers。
- `web/tests/lib/media-storage.test.ts`：本地媒体存储测试。
- `web/lib/media-storage.ts`：媒体文件系统适配器。
- `web/app/api/media/[filename]/route.ts`：受控媒体读取路由。
- `web/app/styles/tokens.css`：共享品牌 token。
- `web/tests/styles/tokens.test.ts`：token 契约测试。

**修改：**

- `.gitignore`：补充嵌套 Web 产物规则。
- `web/.gitignore`：确保数据库、媒体和环境文件不入库。
- `web/package.json`、`web/package-lock.json`：增加测试、类型检查脚本和依赖。
- `web/app/api/admin/media/route.ts`：上传通过存储适配器。
- `web/app/api/admin/media/[id]/route.ts`：删除通过存储适配器。
- `web/lib/repository.ts`：按文件名读取媒体记录。
- `web/app/globals.css`：导入共享 token，并删除被迁移到 token 文件的重复根变量。

### Task 1: 导入官网并锁定污染边界

- [ ] **Step 1: 编写会失败的 workspace 测试**

创建 `tests/repository/test_web_workspace.py`：

```python
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"


def test_web_workspace_contains_existing_site() -> None:
    required = (
        "package.json",
        "package-lock.json",
        "app/page.tsx",
        "app/layout.tsx",
        "components/SiteHeader.tsx",
        "lib/db.ts",
    )

    assert [item for item in required if not (WEB / item).is_file()] == []


def test_web_source_tree_excludes_local_artifacts() -> None:
    tracked = subprocess.run(
        ["git", "ls-files", "web"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.splitlines()
    forbidden = re.compile(
        r"(^|/)(node_modules|\.next|\.env(?:\..*)?|\.DS_Store)(/|$)"
        r"|\.db(?:$|-)|public/uploads/(?!\.gitkeep$)"
    )

    assert [path for path in tracked if forbidden.search(path)] == []
```

- [ ] **Step 2: 运行测试确认 Red**

Run: `uv run pytest tests/repository/test_web_workspace.py -v`

Expected: FAIL，因为 `web/package.json` 等文件尚不存在。

- [ ] **Step 3: 执行带排除规则的机械迁移**

Run:

```bash
rsync -a \
  --exclude node_modules \
  --exclude .next \
  --exclude '.env*' \
  --exclude '.DS_Store' \
  --exclude 'data/*.db*' \
  --exclude 'public/uploads/*' \
  ../senseorder-web/ web/
mkdir -p web/public/uploads
touch web/public/uploads/.gitkeep
```

然后把根 `.gitignore` 补充为：

```gitignore
web/node_modules/
web/.next/
web/data/*.db
web/data/*.db-*
web/public/uploads/*
!web/public/uploads/.gitkeep
```

- [ ] **Step 4: 运行迁移测试确认 Green**

Run: `uv run pytest tests/repository/test_web_workspace.py -v`

Expected: `2 passed`。

- [ ] **Step 5: 安装并验证原官网基线**

Run: `npm --prefix web ci`

Run: `npm --prefix web run lint`

Run: `DATABASE_PATH=/tmp/senseorder-foundation-build.db npm --prefix web run build`

Expected: 三条命令退出码均为 0。

- [ ] **Step 6: 暂存后审计禁入文件**

Run: `git add .gitignore web tests/repository/test_web_workspace.py`

Run:

```bash
git diff --cached --name-only | rg '(^|/)(node_modules|\.next|\.env|\.DS_Store)(/|$)|\.db($|-)|public/uploads/.+'
```

Expected: 无输出且退出码为 1；`web/public/uploads/.gitkeep` 允许存在。

- [ ] **Step 7: 提交迁移基线**

```bash
git commit -m "chore: import SenseOrder web workspace"
```

### Task 2: 建立 Web 类型与测试工具链

- [ ] **Step 1: 安装确定版本的测试依赖**

Run:

```bash
npm --prefix web install --save-dev vitest@3.2.4 jsdom@26.1.0 @testing-library/react@16.3.0 @testing-library/jest-dom@6.6.3 @testing-library/user-event@14.6.1
```

在 `web/package.json` 的 `scripts` 中加入：

```json
{
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 2: 创建测试配置**

创建 `web/vitest.config.ts`：

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    restoreMocks: true,
  },
});
```

创建 `web/tests/setup.ts`：

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: 增加最小测试验证配置生效**

创建 `web/tests/lib/test-environment.test.ts`：

```ts
import { describe, expect, it } from "vitest";

describe("web test environment", () => {
  it("provides a browser document", () => {
    const node = document.createElement("main");
    node.textContent = "SenseOrder";
    expect(node).toHaveTextContent("SenseOrder");
  });
});
```

- [ ] **Step 4: 运行 Web 基线门禁**

Run: `npm --prefix web run test`

Expected: `1 passed`。

Run: `npm --prefix web run typecheck`

Run: `npm --prefix web run lint`

Expected: 均退出码为 0。

- [ ] **Step 5: 提交测试基线**

```bash
git add web/package.json web/package-lock.json web/vitest.config.ts web/tests
git commit -m "test: establish web quality baseline"
```

### Task 3: 用可挂载存储适配器管理媒体

- [ ] **Step 1: 编写媒体存储 Red 测试**

创建 `web/tests/lib/media-storage.test.ts`：

```ts
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalMediaStorage } from "@/lib/media-storage";

describe("LocalMediaStorage", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "senseorder-media-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("writes, reads, and deletes one safe filename", async () => {
    const storage = new LocalMediaStorage(root);
    await storage.write("asset.png", Buffer.from("image"));

    await expect(storage.read("asset.png")).resolves.toEqual(Buffer.from("image"));
    await storage.delete("asset.png");
    await expect(storage.read("asset.png")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["../secret", "nested/file.png", "/tmp/file.png", ""]) (
    "rejects unsafe filename %s",
    async (filename) => {
      const storage = new LocalMediaStorage(root);
      await expect(storage.write(filename, Buffer.from("x"))).rejects.toThrow(
        "unsafe media filename",
      );
    },
  );
});
```

- [ ] **Step 2: 运行测试确认 Red**

Run: `npm --prefix web run test -- tests/lib/media-storage.test.ts`

Expected: FAIL，提示无法解析 `@/lib/media-storage`。

- [ ] **Step 3: 实现最小存储适配器**

创建 `web/lib/media-storage.ts`：

```ts
import fs from "node:fs/promises";
import path from "node:path";

export class LocalMediaStorage {
  constructor(private readonly root: string) {}

  private resolve(filename: string) {
    if (!filename || path.basename(filename) !== filename) {
      throw new Error("unsafe media filename");
    }
    return path.join(this.root, filename);
  }

  async write(filename: string, content: Buffer) {
    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(this.resolve(filename), content, { flag: "wx" });
  }

  async read(filename: string) {
    return fs.readFile(this.resolve(filename));
  }

  async delete(filename: string) {
    await fs.unlink(this.resolve(filename)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

export const mediaStorage = new LocalMediaStorage(
  path.resolve(process.cwd(), process.env.MEDIA_ROOT || "./public/uploads"),
);
```

- [ ] **Step 4: 运行存储测试确认 Green**

Run: `npm --prefix web run test -- tests/lib/media-storage.test.ts`

Expected: `5 passed`。

- [ ] **Step 5: 增加数据库按文件名查询**

在 `web/lib/repository.ts` 的媒体方法附近加入：

```ts
getMediaByFilename(filename: string) {
  const row = getDatabase()
    .prepare("SELECT * FROM media WHERE filename = ?")
    .get(filename) as Row | undefined;
  return row ? mapMedia(row) : null;
},
```

- [ ] **Step 6: 把上传和删除改为存储适配器**

在 `web/app/api/admin/media/route.ts` 中删除 `fs`、`path` 写入逻辑，导入 `mediaStorage`，并使用：

```ts
await mediaStorage.write(filename, buffer);
try {
  const media = repository.createMedia({
    filename,
    originalName: path.basename(file.name).slice(0, 240),
    mimeType: detected.mime,
    size: file.size,
    url: `/api/media/${filename}`,
  });
  return NextResponse.json({ media }, { status: 201 });
} catch (error) {
  await mediaStorage.delete(filename);
  return conflictError(error);
}
```

保留 `node:path` 用于清理原始文件名。在 `web/app/api/admin/media/[id]/route.ts` 中导入 `mediaStorage`，并把文件删除替换为：

```ts
repository.deleteMedia(id);
await mediaStorage.delete(media.filename);
return NextResponse.json({ ok: true });
```

- [ ] **Step 7: 先写读取路由测试**

创建 `web/tests/api/media-route.test.ts`，通过 Vitest mock `repository.getMediaByFilename` 和 `mediaStorage.read`，断言：存在记录返回正确 MIME 与 immutable 缓存头；无记录返回 404；不安全文件名返回 404。测试直接调用导出的 `GET`。

核心断言必须为：

```ts
expect(response.status).toBe(200);
expect(response.headers.get("content-type")).toBe("image/png");
expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
expect(await response.arrayBuffer()).toEqual(Uint8Array.from([1, 2, 3]).buffer);
```

- [ ] **Step 8: 运行读取路由测试确认 Red**

Run: `npm --prefix web run test -- tests/api/media-route.test.ts`

Expected: FAIL，因为读取路由不存在。

- [ ] **Step 9: 实现受控媒体读取路由**

创建 `web/app/api/media/[filename]/route.ts`：

```ts
import path from "node:path";
import { mediaStorage } from "@/lib/media-storage";
import { repository } from "@/lib/repository";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  if (!filename || path.basename(filename) !== filename) {
    return new Response("Not found", { status: 404 });
  }
  const media = repository.getMediaByFilename(filename);
  if (!media) return new Response("Not found", { status: 404 });

  try {
    const content = await mediaStorage.read(filename);
    return new Response(content, {
      headers: {
        "content-type": media.mimeType,
        "content-length": String(content.byteLength),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
```

- [ ] **Step 10: 运行媒体与 Web 全量检查**

Run: `npm --prefix web run test`

Run: `npm --prefix web run typecheck`

Run: `npm --prefix web run lint`

Expected: 均退出码为 0。

- [ ] **Step 11: 提交媒体持久化适配**

```bash
git add web/app/api/admin/media web/app/api/media web/lib/media-storage.ts web/lib/repository.ts web/tests web/package.json web/package-lock.json
git commit -m "feat: persist website media through storage adapter"
```

### Task 4: 提取稳定品牌 token

- [ ] **Step 1: 编写 token Red 测试**

创建 `web/tests/styles/tokens.test.ts`：

```ts
// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("SenseOrder design tokens", () => {
  it("defines the shared multi-accent palette and geometry", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "app/styles/tokens.css"), "utf8");
    expect(css).toContain("--color-bio: #b8ff6d");
    expect(css).toContain("--color-signal: #55d6e8");
    expect(css).toContain("--color-action: #e7b66b");
    expect(css).toContain("--radius-panel: 6px");
    expect(css).toContain("--shell-max: 1280px");
  });
});
```

- [ ] **Step 2: 运行测试确认 Red**

Run: `npm --prefix web run test -- tests/styles/tokens.test.ts`

Expected: FAIL，提示 `app/styles/tokens.css` 不存在。

- [ ] **Step 3: 创建 token 文件并导入**

创建 `web/app/styles/tokens.css`：

```css
:root {
  --color-bg: #07100d;
  --color-surface: #0d1713;
  --color-surface-strong: #13201a;
  --color-text: #e2ebe6;
  --color-text-muted: #8ea198;
  --color-line: rgba(180, 212, 196, 0.16);
  --color-line-strong: rgba(184, 255, 109, 0.42);
  --color-bio: #b8ff6d;
  --color-signal: #55d6e8;
  --color-action: #e7b66b;
  --color-danger: #e58f7d;
  --radius-panel: 6px;
  --shell-max: 1280px;
  --space-page: clamp(20px, 5vw, 72px);
  --font-sans: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}
```

在 `web/app/globals.css` 第一行加入：

```css
@import "./styles/tokens.css";
```

把 `globals.css` 中与上述同名的根变量删除或改为引用这些 token，不能在文件末尾新增覆盖。

- [ ] **Step 4: 运行 token、lint 与 build 检查**

Run: `npm --prefix web run test -- tests/styles/tokens.test.ts`

Run: `npm --prefix web run lint`

Run: `DATABASE_PATH=/tmp/senseorder-foundation-build.db npm --prefix web run build`

Expected: 均退出码为 0。

- [ ] **Step 5: 提交 token 基线**

```bash
git add web/app/styles/tokens.css web/app/globals.css web/tests/styles/tokens.test.ts
git commit -m "style: extract SenseOrder design tokens"
```

### Task 5: 阶段回归与范围审计

- [ ] **Step 1: 运行 Python 回归**

Run: `uv run pytest`

Run: `uv run mypy`

Run: `uv run ruff check .`

Expected: 全部退出码为 0。

- [ ] **Step 2: 运行 Web 回归**

Run: `npm --prefix web run test`

Run: `npm --prefix web run typecheck`

Run: `npm --prefix web run lint`

Run: `DATABASE_PATH=/tmp/senseorder-foundation-build.db npm --prefix web run build`

Expected: 全部退出码为 0。

- [ ] **Step 3: 审计禁入文件和差异**

Run: `git status --short`

Run: `git ls-files web | rg '(^|/)(node_modules|\.next|\.env|\.DS_Store)(/|$)|\.db($|-)|public/uploads/.+' | rg -v 'public/uploads/\.gitkeep$'`

Expected: 第一条无未提交变更；第二条无输出且退出码为 1。

Run: `git diff --check main...HEAD`

Expected: 退出码为 0。
