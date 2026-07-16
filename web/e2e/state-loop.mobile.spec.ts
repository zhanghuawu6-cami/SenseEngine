import { expect, test } from "@playwright/test";
import { collectBrowserErrors } from "./support/browser-assertions";

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
