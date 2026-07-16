import { expect, test } from "@playwright/test";
import { collectBrowserErrors } from "./support/browser-assertions";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const publicRoutes = [
  "/",
  "/technology",
  "/products",
  "/insights",
  "/about",
  "/contact",
] as const;

test.describe.configure({ mode: "serial" });

test("renders every public site route without a server error", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  for (const route of publicRoutes) {
    const response = await page.goto(route);
    expect(response, `${route} must return a document response`).not.toBeNull();
    expect(response?.status(), `${route} must not return 4xx/5xx`).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
  }

  browserErrors.assertNone();
});

test("persists a contact inquiry and shows it to the authenticated administrator", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  const uniqueEmail = `playwright-${Date.now()}@example.test`;

  await page.goto("/contact");
  await page.getByLabel("姓名 *").fill("Playwright 访客");
  await page.getByLabel("组织").fill("SenseOrder E2E");
  await page.getByLabel("邮箱 *").fill(uniqueEmail);
  await page
    .getByLabel("请简单描述合作起点 *")
    .fill("这是 Playwright 生成的唯一端到端合作线索。");
  await page.getByRole("button", { name: "提交信息" }).click();
  await expect(page.getByRole("heading", { name: "信息已经收到。" })).toBeVisible();

  await page.goto("/admin/login");
  await page.getByLabel("账号").fill("playwright-admin@senseorder.test");
  await page.getByLabel("密码").fill("playwright-admin-password");
  await page.getByRole("button", { name: "登录后台" }).click();
  await page.waitForURL("**/admin");
  await page.goto("/admin/leads");
  await expect(page.getByRole("link", { name: uniqueEmail })).toBeVisible();

  browserErrors.assertNone();
});

test("uploads, serves, and deletes a media asset", async ({ page, request }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/admin/login");
  await page.getByLabel("账号").fill("playwright-admin@senseorder.test");
  await page.getByLabel("密码").fill("playwright-admin-password");
  await page.getByRole("button", { name: "登录后台" }).click();
  await page.waitForURL("**/admin");
  await page.goto("/admin/media");
  const fileInput = page.locator('input[type="file"][name="file"]');
  await fileInput.setInputFiles({
    buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
    mimeType: "image/png",
    name: "pixel.png",
  });
  await page.getByRole("button", { name: "开始上传" }).click();

  const asset = page.locator(".media-grid article").filter({ hasText: "pixel.png" });
  await expect(asset).toBeVisible();
  const mediaUrl = await asset.locator("code").textContent();
  expect(mediaUrl).toMatch(/^\/api\/media\/[a-f0-9-]+\.png$/);
  if (mediaUrl === null) throw new Error("Uploaded media URL was not rendered.");

  const mediaResponse = await request.get(mediaUrl);
  expect(mediaResponse.status()).toBe(200);
  expect(mediaResponse.headers()["content-type"]).toBe("image/png");
  expect(await mediaResponse.body()).toEqual(Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"));

  page.once("dialog", (dialog) => dialog.accept());
  await asset.getByTitle("删除").click();
  await expect(asset).toHaveCount(0);
  expect((await request.get(mediaUrl)).status()).toBe(404);

  browserErrors.assertNone();
});
