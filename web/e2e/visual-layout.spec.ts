import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import {
  collectBrowserErrors,
  expectContainedBy,
  expectNoHorizontalOverflow,
  expectNonOverlapping,
} from "./support/browser-assertions";

const viewports = [
  { height: 844, width: 390 },
  { height: 1024, width: 768 },
  { height: 900, width: 1440 },
  { height: 1080, width: 1920 },
] as const;

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
  width: number,
  height: number,
): Promise<void> {
  await page.screenshot({
    animations: "disabled",
    fullPage: false,
    path: testInfo.outputPath(`${name}-${width}x${height}.png`),
  });
}

async function assertHeaderClear(page: Page): Promise<void> {
  const header = page.locator("header.site-header");
  const title = page.getByRole("heading", { name: "体验一次被理解，也体验一次不被打扰。" });
  await expectNonOverlapping(header, title, "fixed header must not cover the experience title");
}

async function assertIntroTitleUsesAtMostTwoLines(page: Page): Promise<void> {
  const title = page.getByRole("heading", { name: "体验一次被理解，也体验一次不被打扰。" });
  const lineCount = await title.evaluate((element) => {
    const styles = getComputedStyle(element);
    return element.getBoundingClientRect().height / Number.parseFloat(styles.lineHeight);
  });
  expect(lineCount).toBeLessThanOrEqual(2.05);
}

async function scrollToTop(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}

async function assertResultPanelsClear(page: Page, width: number): Promise<void> {
  if (width < 768) {
    const mobileResults = page.getByRole("region", { name: "移动端体验结果" });
    const estimate = mobileResults.getByLabel("状态估计");
    const nextButton = mobileResults.getByRole("button", { name: "查看下一场景" });
    const resultSheet = nextButton.locator("..");
    await expectNonOverlapping(estimate, resultSheet, "mobile estimate and result sheet must not overlap");
    await expectContainedBy(nextButton, resultSheet, "mobile next button must remain inside its result sheet");
    return;
  }

  const desktopResults = page.getByRole("region", { name: "桌面体验结果" });
  await expectNonOverlapping(
    desktopResults.getByLabel("状态估计"),
    desktopResults.getByLabel("克制干预"),
    "desktop estimate and intervention panels must not overlap",
  );
}

async function selectSecondScenario(page: Page, width: number): Promise<Locator> {
  if (width < 768) {
    const mobileResults = page.getByRole("region", { name: "移动端体验结果" });
    await mobileResults.getByRole("button", { name: "查看下一场景" }).click();
    return mobileResults;
  }

  const desktopResults = page.getByRole("region", { name: "桌面体验结果" });
  await desktopResults.getByRole("button", { name: /长时间会议/ }).click();
  return desktopResults;
}

test("captures idle, scenario-two success, and unavailable layouts at target viewports", async ({
  page,
}, testInfo) => {
  const browserErrors = collectBrowserErrors(page);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/experience");
    await expect(page.getByRole("heading", { name: "准备运行固定场景" })).toBeVisible();
    await scrollToTop(page);
    await expectNoHorizontalOverflow(page);
    await assertHeaderClear(page);
    await assertIntroTitleUsesAtMostTwoLines(page);
    await capture(page, testInfo, "idle", viewport.width, viewport.height);

    await page.getByRole("button", { name: "运行状态闭环" }).click();
    const activeResults = await selectSecondScenario(page, viewport.width);
    const activeIntervention = viewport.width < 768
      ? activeResults
      : activeResults.getByLabel("克制干预");
    await expect(activeIntervention.getByText("Suggest Break", { exact: true })).toBeVisible();
    await scrollToTop(page);
    await expectNoHorizontalOverflow(page);
    await assertHeaderClear(page);
    await assertResultPanelsClear(page, viewport.width);
    await capture(page, testInfo, "success-scenario-2", viewport.width, viewport.height);

    await page.route("**/api/demo/run", async (route) => {
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
    await expectNoHorizontalOverflow(page);
    await assertHeaderClear(page);
    await capture(page, testInfo, "unavailable", viewport.width, viewport.height);
    await page.unroute("**/api/demo/run");
  }

  browserErrors.assertNone([/Failed to load resource.*503/]);
});

test("keeps header navigation collision-free across the mobile breakpoint", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  for (const width of [820, 821, 900, 901]) {
    await page.setViewportSize({ height: 900, width });
    await page.goto("/experience");
    await expectNoHorizontalOverflow(page);

    const logo = page.locator("header.site-header .site-logo");
    if (width <= 820) {
      const menu = page.getByRole("button", { name: "打开导航" });
      await expect(menu).toBeVisible();
      await expectNonOverlapping(logo, menu, `${width}px logo and mobile menu must not collide`);
      continue;
    }

    const navigation = page.getByRole("navigation", { name: "主要导航" });
    const contact = page.locator("header.site-header .header-contact");
    await expect(navigation).toBeVisible();
    await expect(contact).toBeVisible();
    await expectNonOverlapping(logo, navigation, `${width}px logo and navigation must not collide`);
    await expectNonOverlapping(navigation, contact, `${width}px navigation and contact must not collide`);
  }

  browserErrors.assertNone();
});
