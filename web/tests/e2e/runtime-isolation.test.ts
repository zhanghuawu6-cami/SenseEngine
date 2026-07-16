import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { removeE2EState } from "../../e2e/support/cleanup";
import { buildE2EPaths, readE2EPaths } from "../../e2e/support/test-paths";

const OWNER_MARKER_FILENAME = ".senseorder-e2e-owner";

type OwnedE2EPaths = ReturnType<typeof buildE2EPaths> & {
  ownerMarkerPath: string;
  ownerToken: string;
};

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

function buildOwnedPaths(testRoot: string, ownerToken: string): OwnedE2EPaths {
  return {
    ...buildE2EPaths(testRoot),
    ownerMarkerPath: path.join(testRoot, OWNER_MARKER_FILENAME),
    ownerToken,
  };
}

function createOwnedRoot(testRoot: string, ownerToken: string): OwnedE2EPaths {
  const paths = buildOwnedPaths(testRoot, ownerToken);
  fs.mkdirSync(testRoot);
  fs.writeFileSync(paths.ownerMarkerPath, `${ownerToken}\n`);
  return paths;
}

describe("Playwright runtime isolation", () => {
  it("allocates distinct absolute roots and valid internal ports for separate runs", () => {
    const first = printRuntime("isolation-one");
    const second = printRuntime("isolation-two");

    expect(path.isAbsolute(first.testRoot)).toBe(true);
    expect(path.isAbsolute(second.testRoot)).toBe(true);
    expect(first.testRoot).not.toBe(second.testRoot);
    for (const runtime of [first, second]) {
      expect(runtime.apiPort).toBeGreaterThanOrEqual(1);
      expect(runtime.apiPort).toBeLessThanOrEqual(65_535);
      expect(runtime.webPort).toBeGreaterThanOrEqual(1);
      expect(runtime.webPort).toBeLessThanOrEqual(65_535);
      expect(runtime.apiPort).not.toBe(runtime.webPort);
    }
  });

  it("teardown removes only the run root with a matching owner marker", async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "senseorder-isolation-test-"));
    const first = createOwnedRoot(path.join(parent, "first"), "first-owner");
    const second = createOwnedRoot(path.join(parent, "second"), "second-owner");
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

  it("fails closed without an owner marker and preserves the run root", async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "senseorder-missing-owner-test-"));
    const paths = buildOwnedPaths(path.join(parent, "run"), "expected-owner");
    fs.mkdirSync(paths.testRoot);
    fs.writeFileSync(paths.databasePath, "keep");

    try {
      await expect(removeE2EState(paths)).rejects.toThrow(/owner marker/i);
      expect(fs.readFileSync(paths.databasePath, "utf8")).toBe("keep");
    } finally {
      fs.rmSync(parent, { force: true, recursive: true });
    }
  });

  it("fails closed on an owner token mismatch and preserves all files", async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "senseorder-wrong-owner-test-"));
    const paths = createOwnedRoot(path.join(parent, "run"), "actual-owner");
    const expectedPaths = buildOwnedPaths(paths.testRoot, "expected-owner");
    fs.writeFileSync(paths.databasePath, "keep");

    try {
      await expect(removeE2EState(expectedPaths)).rejects.toThrow(/owner marker/i);
      expect(fs.readFileSync(paths.ownerMarkerPath, "utf8")).toBe("actual-owner\n");
      expect(fs.readFileSync(paths.databasePath, "utf8")).toBe("keep");
    } finally {
      fs.rmSync(parent, { force: true, recursive: true });
    }
  });

  it("rejects direct Playwright cleanup without an owner token", () => {
    expect(() =>
      readE2EPaths({ ...process.env, SENSEORDER_E2E_ROOT: os.tmpdir() }),
    ).toThrow(/owner token/i);
  });

  it("rejects filesystem and checkout ancestors as dangerous roots", () => {
    expect(() => buildE2EPaths(path.parse(process.cwd()).root)).toThrow(/dangerous/i);
    expect(() => buildE2EPaths(path.resolve(process.cwd(), ".."))).toThrow(/dangerous/i);
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

  it("rejects identical explicit API and Web ports", () => {
    const result = spawnSync(
      process.execPath,
      [path.resolve(process.cwd(), "e2e/run-playwright.mjs"), "--print-runtime"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          SENSEORDER_E2E_API_PORT: "43123",
          SENSEORDER_E2E_WEB_PORT: "43123",
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/ports must differ/i);
  });

  it("reports lock owner details and safe manual recovery instructions", () => {
    const lockPath = path.resolve(process.cwd(), ".playwright-run.lock");
    const owner = {
      format: "senseorder-playwright-lock-v1",
      hostname: "review-host",
      pid: 42_424,
    };
    expect(fs.existsSync(lockPath)).toBe(false);
    fs.writeFileSync(lockPath, `${JSON.stringify(owner)}\n`);

    try {
      const result = spawnSync(
        process.execPath,
        [path.resolve(process.cwd(), "e2e/run-playwright.mjs"), "--list"],
        { encoding: "utf8", env: process.env },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(lockPath);
      expect(result.stderr).toContain("42424");
      expect(result.stderr).toContain("review-host");
      expect(result.stderr).toMatch(/confirm.*process.*delete.*manually/i);
    } finally {
      fs.rmSync(lockPath, { force: true });
    }
  });
});
