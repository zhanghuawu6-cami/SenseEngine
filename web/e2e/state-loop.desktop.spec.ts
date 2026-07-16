import { expect, test } from "@playwright/test";
import { collectBrowserErrors } from "./support/browser-assertions";

test("runs the complete state loop", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/experience");
  await page.getByRole("button", { name: "运行状态闭环" }).click();

  const desktopResults = page.getByRole("region", { name: "桌面体验结果" });
  const intervention = desktopResults.getByLabel("克制干预");
  await expect(page.getByRole("heading", { name: "证据不足", exact: true })).toBeVisible();
  await expect(intervention.getByText("Ask", { exact: true })).toBeVisible();

  await desktopResults.getByRole("button", { name: /长时间会议/ }).click();
  await expect(intervention.getByText("Suggest Break", { exact: true })).toBeVisible();
  await expect(
    intervention.getByText("0.50", { exact: true }),
  ).toBeVisible();

  await desktopResults.getByRole("button", { name: /深度专注/ }).click();
  await expect(intervention.getByText("Silence", { exact: true })).toBeVisible();
  await expect(
    intervention.getByText("0.70", { exact: true }),
  ).toBeVisible();

  browserErrors.assertNone();
});

test("shows unavailable without rendering interactive result actions on 503", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  const intercepted503Urls: string[] = [];
  await page.route("**/api/demo/run", async (route) => {
    intercepted503Urls.push(route.request().url());
    await route.fulfill({
      body: JSON.stringify({
        error: { code: "demo_unavailable", message: "temporarily unavailable" },
      }),
      contentType: "application/json",
      status: 503,
    });
  });

  await page.goto("/experience");
  await page.getByRole("button", { name: "运行状态闭环" }).click();

  const runner = page.locator('section[aria-labelledby="experience-title"]');
  await expect(page.getByRole("heading", { name: "暂时不可用" })).toBeVisible();
  for (const action of ["Ask", "Suggest Break", "Silence"]) {
    await expect(runner.getByText(action, { exact: true })).toHaveCount(0);
  }
  expect(intercepted503Urls.map((url) => new URL(url).pathname)).toEqual(["/api/demo/run"]);

  browserErrors.assertNone([
    { message: /Failed to load resource.*503/, url: /\/api\/demo\/run$/ },
  ]);
});
