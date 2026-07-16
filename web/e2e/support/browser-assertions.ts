import { expect, type Locator, type Page } from "@playwright/test";

type BrowserErrors = {
  assertNone: (allowed?: readonly AllowedBrowserError[]) => void;
};

type AllowedBrowserError = {
  message: RegExp;
  url: RegExp;
};

type BrowserError = {
  message: string;
  source: "console" | "pageerror";
  url: string;
};

export function collectBrowserErrors(page: Page): BrowserErrors {
  const errors: BrowserError[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push({
        message: message.text(),
        source: "console",
        url: message.location().url,
      });
    }
  });
  page.on("pageerror", (error) => {
    errors.push({ message: error.message, source: "pageerror", url: page.url() });
  });

  return {
    assertNone(allowed = []) {
      const unexpected = errors.filter(
        (error) => !allowed.some(
          (candidate) => candidate.message.test(error.message) && candidate.url.test(error.url),
        ),
      );
      expect(
        unexpected,
        `unexpected browser errors:\n${JSON.stringify(unexpected, null, 2)}`,
      ).toEqual([]);
    },
  };
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    offenders: Array.from(document.querySelectorAll("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          className: typeof element.className === "string" ? element.className : "",
          left: Math.round(rect.left * 10) / 10,
          right: Math.round(rect.right * 10) / 10,
          tag: element.tagName,
        };
      })
      .filter(({ left, right }) => left < -0.5 || right > document.documentElement.clientWidth + 0.5)
      .slice(0, 12),
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.scrollWidth,
    `horizontal overflow offenders: ${JSON.stringify(dimensions.offenders)}`,
  ).toBe(dimensions.clientWidth);
}

export async function expectNonOverlapping(
  first: Locator,
  second: Locator,
  description: string,
): Promise<void> {
  const [firstBox, secondBox] = await Promise.all([
    first.boundingBox(),
    second.boundingBox(),
  ]);
  expect(firstBox, `${description}: first element must be rendered`).not.toBeNull();
  expect(secondBox, `${description}: second element must be rendered`).not.toBeNull();
  if (firstBox === null || secondBox === null) return;

  const overlaps = !(
    firstBox.x + firstBox.width <= secondBox.x ||
    secondBox.x + secondBox.width <= firstBox.x ||
    firstBox.y + firstBox.height <= secondBox.y ||
    secondBox.y + secondBox.height <= firstBox.y
  );
  expect(overlaps, description).toBe(false);
}

export async function expectContainedBy(
  child: Locator,
  parent: Locator,
  description: string,
): Promise<void> {
  const [childBox, parentBox] = await Promise.all([
    child.boundingBox(),
    parent.boundingBox(),
  ]);
  expect(childBox, `${description}: child must be rendered`).not.toBeNull();
  expect(parentBox, `${description}: parent must be rendered`).not.toBeNull();
  if (childBox === null || parentBox === null) return;

  expect(childBox.x).toBeGreaterThanOrEqual(parentBox.x);
  expect(childBox.y).toBeGreaterThanOrEqual(parentBox.y);
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(parentBox.x + parentBox.width);
  expect(childBox.y + childBox.height).toBeLessThanOrEqual(parentBox.y + parentBox.height);
}
