// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const canonicalTokens = [
  "--color-bio: #b8ff6d;",
  "--color-signal: #55d6e8;",
  "--color-action: #e7b66b;",
  "--radius-panel: 6px;",
  "--shell-max: 1280px;",
] as const;

describe("shared design tokens", () => {
  it("defines the canonical SenseOrder contracts", () => {
    const tokens = readFileSync(resolve(process.cwd(), "app/styles/tokens.css"), "utf8");

    for (const token of canonicalTokens) {
      expect(tokens).toContain(token);
    }
  });

  it("loads canonical tokens before globals without redefining them", () => {
    const globals = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

    expect(globals.startsWith('@import "./styles/tokens.css";')).toBe(true);
    for (const token of canonicalTokens) {
      const name = token.slice(0, token.indexOf(":"));
      expect(globals).not.toMatch(new RegExp(`${name}\\s*:`));
    }
  });
});
