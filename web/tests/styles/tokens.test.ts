// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const canonicalTokens = {
  "--color-bg": "#07100d",
  "--color-surface": "#0d1713",
  "--color-surface-strong": "#13201a",
  "--color-text": "#e2ebe6",
  "--color-text-muted": "#8ea198",
  "--color-line": "rgba(180, 212, 196, 0.16)",
  "--color-line-strong": "rgba(184, 255, 109, 0.42)",
  "--color-bio": "#b8ff6d",
  "--color-signal": "#55d6e8",
  "--color-action": "#e7b66b",
  "--color-danger": "#e58f7d",
  "--radius-panel": "6px",
  "--shell-max": "1280px",
  "--space-page": "clamp(20px, 5vw, 72px)",
  "--sense-font-sans": 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
  "--sense-font-mono": '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
} as const;

const sharedContractNames = [
  "--color-bio",
  "--color-signal",
  "--color-action",
  "--radius-panel",
  "--shell-max",
] as const;

function parseBlock(css: string, pattern: RegExp): Map<string, string> {
  const declarations = css.match(pattern)?.[1];
  if (declarations === undefined) {
    throw new Error(`CSS block not found: ${pattern.source}`);
  }

  return new Map(
    declarations
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(":");
        return [
          declaration.slice(0, separator).trim(),
          declaration.slice(separator + 1).trim(),
        ];
      }),
  );
}

describe("shared design tokens", () => {
  it("defines the complete canonical SenseOrder token map", () => {
    const tokens = readFileSync(resolve(process.cwd(), "app/styles/tokens.css"), "utf8");
    const root = parseBlock(tokens, /:root\s*\{([^}]*)\}/);

    expect(Object.fromEntries(root)).toEqual(canonicalTokens);
  });

  it("does not override Tailwind typography theme variables", () => {
    const tokens = readFileSync(resolve(process.cwd(), "app/styles/tokens.css"), "utf8");
    const root = parseBlock(tokens, /:root\s*\{([^}]*)\}/);

    expect(root.has("--font-sans")).toBe(false);
    expect(root.has("--font-mono")).toBe(false);
  });

  it("loads canonical tokens before globals without redefining them", () => {
    const globals = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

    expect(globals.startsWith('@import "./styles/tokens.css";')).toBe(true);
    for (const name of sharedContractNames) {
      expect(globals).not.toMatch(new RegExp(`${name}\\s*:`));
    }
  });

  it("aliases the existing theme and visual-system properties to canonical tokens", () => {
    const globals = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    const theme = parseBlock(globals, /@theme\s*\{([^}]*)\}/);
    const visualSystem = globals.slice(globals.indexOf("/* SenseOrder 2026 visual system"));
    const legacyRoot = parseBlock(visualSystem, /:root\s*\{([^}]*)\}/);

    expect(theme.get("--color-bio-400")).toBe("var(--color-bio)");
    expect(theme.get("--color-amber-soft")).toBe("var(--color-action)");
    expect(legacyRoot.get("--cyan-400")).toBe("var(--color-bio)");
    expect(legacyRoot.get("--amber-500")).toBe("var(--color-action)");
    expect(legacyRoot.get("--shell")).toBe("var(--shell-max)");
  });

  it("keeps the fifth navigation link within medium-width header tracks", () => {
    const globals = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

    expect(globals).toMatch(
      /@media\s+\(min-width:\s*821px\)\s+and\s+\(max-width:\s*900px\)\s*\{\s*\.site-header__inner\.shell\s*\{\s*grid-template-columns:\s*210px minmax\(0,\s*1fr\) 170px;\s*\}\s*\.desktop-nav\s*\{\s*gap:\s*24px;\s*\}\s*\}/,
    );
  });
});
