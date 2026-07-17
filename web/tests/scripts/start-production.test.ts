// @vitest-environment node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

const sourceScript = path.resolve(process.cwd(), "scripts/start-production.mjs");
const temporaryRoots: string[] = [];

type ProductionEnvironment = Record<string, string>;

function createFixture(): { markerPath: string; scriptPath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "senseorder-production-start-test-"));
  temporaryRoots.push(root);
  const scriptsDirectory = path.join(root, "scripts");
  fs.mkdirSync(scriptsDirectory);
  const scriptPath = path.join(scriptsDirectory, "start-production.mjs");
  const markerPath = path.join(root, "server-imported");
  fs.copyFileSync(sourceScript, scriptPath);
  fs.writeFileSync(
    path.join(root, "server.js"),
    'require("node:fs").writeFileSync(process.env.SERVER_IMPORT_MARKER, "imported");\n',
    "utf8",
  );
  return { markerPath, scriptPath };
}

function completeEnvironment(markerPath: string): ProductionEnvironment {
  return {
    ADMIN_EMAIL: "production-admin@senseorder.test",
    ADMIN_PASSWORD: "production-password-sentinel",
    NODE_ENV: "production",
    SERVER_IMPORT_MARKER: markerPath,
    SESSION_SECRET: "production-session-secret-sentinel",
  };
}

function spawnStarter(scriptPath: string, environment: ProductionEnvironment) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: environment as NodeJS.ProcessEnv,
  });
}

afterEach(() => {
  for (const temporaryRoot of temporaryRoots.splice(0)) {
    fs.rmSync(temporaryRoot, { force: true, recursive: true });
  }
});

describe("production startup authentication guard", () => {
  test.each([
    ["ADMIN_EMAIL", undefined],
    ["ADMIN_EMAIL", " \t "],
    ["ADMIN_PASSWORD", undefined],
    ["ADMIN_PASSWORD", "\n"],
    ["SESSION_SECRET", undefined],
    ["SESSION_SECRET", "   "],
  ])("rejects %s when its value is %s", (variable, value) => {
    const fixture = createFixture();
    const environment = completeEnvironment(fixture.markerPath);
    if (value === undefined) {
      delete environment[variable];
    } else {
      environment[variable] = value;
    }

    const result = spawnStarter(fixture.scriptPath, environment);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Production authentication configuration is invalid.\n");
    expect(result.stderr).not.toContain("production-password-sentinel");
    expect(result.stderr).not.toContain("production-session-secret-sentinel");
    expect(result.stderr).not.toContain(fixture.scriptPath);
    expect(fs.existsSync(fixture.markerPath)).toBe(false);
  });

  test.each([undefined, "development"])("rejects NODE_ENV=%s", (nodeEnvironment) => {
    const fixture = createFixture();
    const environment = completeEnvironment(fixture.markerPath);
    if (nodeEnvironment === undefined) {
      delete environment.NODE_ENV;
    } else {
      environment.NODE_ENV = nodeEnvironment;
    }

    const result = spawnStarter(fixture.scriptPath, environment);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("Production authentication configuration is invalid.\n");
    expect(fs.existsSync(fixture.markerPath)).toBe(false);
  });

  test("imports the standalone server when production authentication is configured", () => {
    const fixture = createFixture();
    const result = spawnStarter(fixture.scriptPath, completeEnvironment(fixture.markerPath));

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(fs.readFileSync(fixture.markerPath, "utf8")).toBe("imported");
  });
});
