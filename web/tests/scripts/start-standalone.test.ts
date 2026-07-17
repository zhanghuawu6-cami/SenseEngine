// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { prepareStandalone } from "../../scripts/start-standalone.mjs";

const temporaryRoots: string[] = [];

function makeWebRoot(): string {
  const webRoot = fs.mkdtempSync(path.join(os.tmpdir(), "senseorder-standalone-test-"));
  temporaryRoots.push(webRoot);
  return webRoot;
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function createCompleteFixture(): string {
  const webRoot = makeWebRoot();
  writeFile(path.join(webRoot, "public", "brand.txt"), "current-public");
  writeFile(path.join(webRoot, ".next", "static", "chunks", "app.js"), "current-static");
  writeFile(path.join(webRoot, ".next", "standalone", "server.js"), "// server");
  return webRoot;
}

afterEach(() => {
  for (const temporaryRoot of temporaryRoots.splice(0)) {
    fs.rmSync(temporaryRoot, { force: true, recursive: true });
  }
});

describe("prepareStandalone", () => {
  test("replaces stale assets with the current public and static trees", async () => {
    const webRoot = createCompleteFixture();
    const standaloneRoot = path.join(webRoot, ".next", "standalone");
    writeFile(path.join(standaloneRoot, "public", "stale.txt"), "stale");
    writeFile(path.join(standaloneRoot, ".next", "static", "stale.js"), "stale");

    const preparedRoot = await prepareStandalone(webRoot);

    expect(preparedRoot).toBe(standaloneRoot);
    expect(fs.readFileSync(path.join(standaloneRoot, "public", "brand.txt"), "utf8")).toBe(
      "current-public",
    );
    expect(
      fs.readFileSync(path.join(standaloneRoot, ".next", "static", "chunks", "app.js"), "utf8"),
    ).toBe("current-static");
    expect(fs.existsSync(path.join(standaloneRoot, "public", "stale.txt"))).toBe(false);
    expect(fs.existsSync(path.join(standaloneRoot, ".next", "static", "stale.js"))).toBe(false);
  });

  test.each([
    ["public directory", "public"],
    ["Next static directory", path.join(".next", "static")],
    ["standalone server", path.join(".next", "standalone", "server.js")],
  ])("rejects a missing %s", (expectedMessage, missingPath) => {
    const webRoot = createCompleteFixture();
    fs.rmSync(path.join(webRoot, missingPath), { force: true, recursive: true });

    expect(() => prepareStandalone(webRoot)).toThrow(expectedMessage);
  });

  test("refuses to traverse a destination parent symlink", () => {
    const webRoot = createCompleteFixture();
    const outsideRoot = path.join(webRoot, "outside-standalone");
    const outsideStatic = path.join(outsideRoot, "static");
    writeFile(path.join(outsideStatic, "keep.txt"), "must-survive");
    fs.symlinkSync(outsideRoot, path.join(webRoot, ".next", "standalone", ".next"), "dir");

    expect(() => prepareStandalone(webRoot)).toThrow("outside standalone output");
    expect(fs.readFileSync(path.join(outsideStatic, "keep.txt"), "utf8")).toBe("must-survive");
  });

  test("rejects a standalone root symlink before changing external assets", () => {
    const webRoot = makeWebRoot();
    writeFile(path.join(webRoot, "public", "brand.txt"), "current-public");
    writeFile(path.join(webRoot, ".next", "static", "chunks", "app.js"), "current-static");

    const outsideRoot = makeWebRoot();
    writeFile(path.join(outsideRoot, "server.js"), "// external server");
    writeFile(path.join(outsideRoot, "sentinel.txt"), "must-survive");
    writeFile(path.join(outsideRoot, "public", "external.txt"), "external-public");
    writeFile(path.join(outsideRoot, ".next", "static", "external.js"), "external-static");
    fs.symlinkSync(outsideRoot, path.join(webRoot, ".next", "standalone"), "dir");

    expect(() => prepareStandalone(webRoot)).toThrow("standalone output must be a real directory");
    expect(fs.readFileSync(path.join(outsideRoot, "sentinel.txt"), "utf8")).toBe("must-survive");
    expect(fs.readFileSync(path.join(outsideRoot, "public", "external.txt"), "utf8")).toBe(
      "external-public",
    );
    expect(fs.readFileSync(path.join(outsideRoot, ".next", "static", "external.js"), "utf8")).toBe(
      "external-static",
    );
  });

  test.each([
    ["public directory", "public"],
    ["Next static directory", path.join(".next", "static")],
  ])("rejects a symlinked %s source root", (expectedMessage, sourcePath) => {
    const webRoot = createCompleteFixture();
    const outsideRoot = makeWebRoot();
    writeFile(path.join(outsideRoot, "external.txt"), "external-source");
    fs.rmSync(path.join(webRoot, sourcePath), { force: true, recursive: true });
    fs.symlinkSync(outsideRoot, path.join(webRoot, sourcePath), "dir");

    expect(() => prepareStandalone(webRoot)).toThrow(`${expectedMessage} must be a real directory`);
  });

  test.each([
    ["file", path.join("public", "linked.txt"), "file"],
    ["directory", path.join(".next", "static", "linked"), "dir"],
  ])("rejects a source tree containing a %s symlink", (_kind, linkPath, linkType) => {
    const webRoot = createCompleteFixture();
    const outsideRoot = makeWebRoot();
    const outsideTarget =
      linkType === "file" ? path.join(outsideRoot, "secret.txt") : path.join(outsideRoot, "assets");
    if (linkType === "file") {
      writeFile(outsideTarget, "external-secret");
    } else {
      writeFile(path.join(outsideTarget, "secret.txt"), "external-secret");
    }
    fs.symlinkSync(outsideTarget, path.join(webRoot, linkPath), linkType as fs.symlink.Type);

    expect(() => prepareStandalone(webRoot)).toThrow("Source asset trees cannot contain symlinks");
  });

  test("rejects a symlinked standalone server entry", () => {
    const webRoot = createCompleteFixture();
    const outsideRoot = makeWebRoot();
    const serverEntry = path.join(webRoot, ".next", "standalone", "server.js");
    const outsideServer = path.join(outsideRoot, "server.js");
    writeFile(outsideServer, "// external server");
    fs.rmSync(serverEntry);
    fs.symlinkSync(outsideServer, serverEntry, "file");

    expect(() => prepareStandalone(webRoot)).toThrow("standalone server must be a regular file");
  });
});

test("production entry points use the local standalone launcher", () => {
  const webRoot = path.resolve(__dirname, "../..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(webRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const playwrightConfig = fs.readFileSync(path.join(webRoot, "playwright.config.ts"), "utf8");

  expect(packageJson.scripts.start).toBe("node scripts/start-standalone.mjs");
  expect(playwrightConfig).not.toContain("next start");
  expect(playwrightConfig).toContain("command: `npm run build && npm run start`");
  expect(playwrightConfig).toContain('HOSTNAME: "127.0.0.1"');
  expect(playwrightConfig).toContain("PORT: String(webPort)");
});

test("README documents the standalone production launcher and bind address", () => {
  const readme = fs.readFileSync(path.resolve(__dirname, "../../../README.md"), "utf8");

  expect(readme).toContain("HOSTNAME=127.0.0.1");
  expect(readme).toContain("PORT=3000");
  expect(readme).toContain("standalone");
  expect(readme).toContain("npm --prefix web run start");
});
