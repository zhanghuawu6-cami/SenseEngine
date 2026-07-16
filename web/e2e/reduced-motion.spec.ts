import { expect, test } from "@playwright/test";
import { collectBrowserErrors } from "./support/browser-assertions";

test("disables key experience motion when reduced motion is requested", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/experience");
  expect(
    await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
  ).toBe(true);
  await page.getByRole("button", { name: "运行状态闭环" }).click();

  const mobileResults = page.getByRole("region", { name: "移动端体验结果" });
  const metric = mobileResults.getByText("认知负荷").locator("..").locator("strong");
  const resultSheet = mobileResults.getByRole("button", { name: "查看下一场景" }).locator("..");

  await expect(metric).toBeVisible();
  await expect(metric).toHaveClass(/animatedValue/);
  await expect(resultSheet).toBeVisible();
  const styles = await Promise.all([
    metric.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { animationName: computed.animationName, transitionDuration: computed.transitionDuration };
    }),
    resultSheet.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { animationName: computed.animationName, transitionDuration: computed.transitionDuration };
    }),
    page.locator("html").evaluate((element) => getComputedStyle(element).scrollBehavior),
  ]);

  for (const style of [styles[0], styles[1]]) {
    expect(style.animationName).toBe("none");
    expect(Number.parseFloat(style.transitionDuration)).toBeLessThanOrEqual(0.00001);
  }
  expect(styles[2]).toBe("auto");
  browserErrors.assertNone();
});
