import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildE2EPaths,
  removeE2EState,
} from "../../e2e/support/cleanup";

type PrintedRuntime = {
  apiPort: number;
  testRoot: string;
  webPort: number;
};

function printRuntime(runId: string): PrintedRuntime {
  const output = execFileSync(
    process.execPath,
    [path.resolve(process.cwd(), "e2e/run-playwright.mjs"), "--print-runtime"],
    {
      encoding: "utf8",
      env: { ...process.env, SENSEORDER_E2E_RUN_ID: runId },
    },
  );
  return JSON.parse(output) as PrintedRuntime;
}

describe("Playwright runtime isolation", () => {
  it("allocates distinct absolute roots and ports for separate runs", () => {
    const first = printRuntime("isolation-one");
    const second = printRuntime("isolation-two");

    expect(path.isAbsolute(first.testRoot)).toBe(true);
    expect(path.isAbsolute(second.testRoot)).toBe(true);
    expect(first.testRoot).not.toBe(second.testRoot);
    expect(first.apiPort).not.toBe(second.apiPort);
    expect(first.webPort).not.toBe(second.webPort);
    expect(first.apiPort).not.toBe(first.webPort);
    expect(second.apiPort).not.toBe(second.webPort);
  });

  it("teardown removes only the requested run root", async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "senseorder-isolation-test-"));
    const first = buildE2EPaths(path.join(parent, "first"));
    const second = buildE2EPaths(path.join(parent, "second"));
    fs.mkdirSync(first.mediaRoot, { recursive: true });
    fs.mkdirSync(second.mediaRoot, { recursive: true });
    fs.writeFileSync(first.databasePath, "first");
    fs.writeFileSync(second.databasePath, "second");

    try {
      await removeE2EState(first);
      expect(fs.existsSync(first.testRoot)).toBe(false);
      expect(fs.existsSync(second.databasePath)).toBe(true);
    } finally {
      fs.rmSync(parent, { force: true, recursive: true });
    }
  });

  it("removes an allocated run root when runtime configuration fails", () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "senseorder-invalid-runtime-test-"),
    );

    try {
      const result = spawnSync(
        process.execPath,
        [path.resolve(process.cwd(), "e2e/run-playwright.mjs"), "--print-runtime"],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            SENSEORDER_E2E_API_PORT: "invalid",
            TMPDIR: temporaryDirectory,
          },
        },
      );

      expect(result.status).not.toBe(0);
      expect(fs.readdirSync(temporaryDirectory)).toEqual([]);
    } finally {
      fs.rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it("refuses to delete a pre-existing configured run root", () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "senseorder-owned-root-test-"));
    const configuredRoot = path.join(parent, "existing");
    const marker = path.join(configuredRoot, "keep.txt");
    fs.mkdirSync(configuredRoot);
    fs.writeFileSync(marker, "keep");

    try {
      const result = spawnSync(
        process.execPath,
        [path.resolve(process.cwd(), "e2e/run-playwright.mjs"), "--print-runtime"],
        {
          encoding: "utf8",
          env: { ...process.env, SENSEORDER_E2E_ROOT: configuredRoot },
        },
      );

      expect(result.status).not.toBe(0);
      expect(fs.readFileSync(marker, "utf8")).toBe("keep");
    } finally {
      fs.rmSync(parent, { force: true, recursive: true });
    }
  });
});
