import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  collectBrowserErrors,
  expectContainedBy,
  expectNoHorizontalOverflow,
  expectNonOverlapping,
} from "./support/browser-assertions";

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({
    animations: "disabled",
    fullPage: false,
    path: testInfo.outputPath(`${name}-390x844.png`),
  });
}

async function expectNoDevelopmentIndicator(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Open Next.js Dev Tools" })).toHaveCount(0);
}

async function scrollToTop(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}

test("advances mobile scenarios locally through the next-scene control", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  let demoRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/demo/run")) {
      demoRequests += 1;
    }
  });

  await page.goto("/experience");
  await page.getByRole("button", { name: "运行状态闭环" }).click();

  const mobileResults = page.getByRole("region", { name: "移动端体验结果" });
  await expect(mobileResults.getByText("Ask", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "桌面体验结果" })).toBeHidden();
  expect(demoRequests).toBe(1);

  await mobileResults.getByRole("button", { name: "查看下一场景" }).click();
  await expect(mobileResults.getByText("Suggest Break", { exact: true })).toBeVisible();
  expect(demoRequests).toBe(1);

  await mobileResults.getByRole("button", { name: "查看下一场景" }).click();
  await expect(mobileResults.getByText("Silence", { exact: true })).toBeVisible();
  await expect(mobileResults.getByRole("button", { name: "重新运行" })).toBeVisible();
  expect(demoRequests).toBe(1);

  browserErrors.assertNone();
});

test("captures mobile idle, scenario-two success, and unavailable layouts", async ({
  page,
}, testInfo) => {
  const browserErrors = collectBrowserErrors(page);
  const title = page.getByRole("heading", {
    name: "体验一次被理解，也体验一次不被打扰。",
  });
  const header = page.locator("header.site-header");

  await page.goto("/experience");
  await expect(page.getByRole("heading", { name: "准备运行固定场景" })).toBeVisible();
  await scrollToTop(page);
  await expectNoDevelopmentIndicator(page);
  await expectNoHorizontalOverflow(page);
  await expectNonOverlapping(header, title, "mobile header must not cover the title");
  await capture(page, testInfo, "idle");

  await page.getByRole("button", { name: "运行状态闭环" }).click();
  const mobileResults = page.getByRole("region", { name: "移动端体验结果" });
  await mobileResults.getByRole("button", { name: "查看下一场景" }).click();
  await expect(mobileResults.getByText("Suggest Break", { exact: true })).toBeVisible();
  await scrollToTop(page);
  const estimate = mobileResults.getByLabel("状态估计");
  const nextButton = mobileResults.getByRole("button", { name: "查看下一场景" });
  const resultSheet = nextButton.locator("..");
  await expectNoDevelopmentIndicator(page);
  await expectNoHorizontalOverflow(page);
  await expectNonOverlapping(estimate, resultSheet, "mobile result panels must not overlap");
  await expectContainedBy(nextButton, resultSheet, "mobile next button must stay in its panel");
  await capture(page, testInfo, "success-scenario-2");

  const intercepted503Urls: string[] = [];
  await page.route("**/api/demo/run", async (route) => {
    intercepted503Urls.push(route.request().url());
    await route.fulfill({
      body: JSON.stringify({ error: { code: "demo_unavailable", message: "unavailable" } }),
      contentType: "application/json",
      status: 503,
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "运行状态闭环" }).click();
  await expect(page.getByRole("heading", { name: "暂时不可用" })).toBeVisible();
  await scrollToTop(page);
  await expectNoDevelopmentIndicator(page);
  await expectNoHorizontalOverflow(page);
  await expectNonOverlapping(header, title, "mobile unavailable header must not cover the title");
  await capture(page, testInfo, "unavailable");
  expect(intercepted503Urls.map((url) => new URL(url).pathname)).toEqual(["/api/demo/run"]);

  browserErrors.assertNone([
    { message: /Failed to load resource.*503/, url: /\/api\/demo\/run$/ },
  ]);
});
