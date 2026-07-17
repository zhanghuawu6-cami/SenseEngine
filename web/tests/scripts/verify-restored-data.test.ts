// @vitest-environment node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vitest";

const scriptPath = path.resolve(process.cwd(), "scripts/verify-restored-data.mjs");
const temporaryRoots: string[] = [];

type Fixture = {
  databasePath: string;
  mediaRoot: string;
  root: string;
};

function makeFixture(filename = "restored.png", content = Buffer.from("restored-media")): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "senseorder-restore-data-test-"));
  temporaryRoots.push(root);
  const databasePath = path.join(root, "senseorder.db");
  const mediaRoot = path.join(root, "media");
  fs.mkdirSync(mediaRoot);
  fs.writeFileSync(path.join(mediaRoot, filename), content);
  const database = new Database(databasePath);
  try {
    database.exec("CREATE TABLE media (filename TEXT NOT NULL UNIQUE, size INTEGER NOT NULL)");
    database.prepare("INSERT INTO media (filename, size) VALUES (?, ?)").run(
      filename,
      content.length,
    );
  } finally {
    database.close();
  }
  return { databasePath, mediaRoot, root };
}

function runVerifier(
  fixture: Fixture,
  environment: Record<string, string | undefined> = {},
) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_PATH: fixture.databasePath,
      MEDIA_ROOT: fixture.mediaRoot,
      ...environment,
    },
  });
}

function expectGenericFailure(result: ReturnType<typeof runVerifier>): void {
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("Restored data verification failed.\n");
}

afterEach(() => {
  for (const temporaryRoot of temporaryRoots.splice(0)) {
    fs.rmSync(temporaryRoot, { force: true, recursive: true });
  }
});

describe("verify-restored-data CLI", () => {
  test("accepts an intact database and exact regular media set", () => {
    const result = runVerifier(makeFixture());

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("restored data verification passed\n");
    expect(result.stderr).toBe("");
  });

  test("runs SQLite integrity_check in read-only mode", () => {
    const source = fs.readFileSync(scriptPath, "utf8");

    expect(source).toContain("readonly: true");
    expect(source).toContain("PRAGMA integrity_check");
  });

  test("rejects a corrupt database without printing its path or bytes", () => {
    const fixture = makeFixture();
    fs.writeFileSync(fixture.databasePath, "corrupt-database-secret");

    const result = runVerifier(fixture);

    expectGenericFailure(result);
    expect(result.stderr).not.toContain(fixture.databasePath);
    expect(result.stderr).not.toContain("corrupt-database-secret");
  });

  test.each([
    ["missing file", (fixture: Fixture) => fs.rmSync(path.join(fixture.mediaRoot, "restored.png"))],
    ["size mismatch", (fixture: Fixture) => fs.appendFileSync(path.join(fixture.mediaRoot, "restored.png"), "x")],
    ["orphan file", (fixture: Fixture) => fs.writeFileSync(path.join(fixture.mediaRoot, "orphan.png"), "orphan")],
  ])("rejects a %s", (_case, mutate) => {
    const fixture = makeFixture();
    mutate(fixture);

    const result = runVerifier(fixture);

    expectGenericFailure(result);
  });

  test("rejects a media file symlink", () => {
    const fixture = makeFixture();
    const mediaPath = path.join(fixture.mediaRoot, "restored.png");
    const target = path.join(fixture.root, "outside.png");
    fs.writeFileSync(target, "restored-media");
    fs.rmSync(mediaPath);
    fs.symlinkSync(target, mediaPath, "file");

    expectGenericFailure(runVerifier(fixture));
  });

  test("rejects a media-root directory symlink", () => {
    const fixture = makeFixture();
    const realRoot = path.join(fixture.root, "real-media");
    fs.renameSync(fixture.mediaRoot, realRoot);
    fs.symlinkSync(realRoot, fixture.mediaRoot, "dir");

    expectGenericFailure(runVerifier(fixture));
  });

  test("rejects a directory or symlink entry in the media root", () => {
    const fixture = makeFixture();
    fs.mkdirSync(path.join(fixture.mediaRoot, "unexpected-directory"));

    expectGenericFailure(runVerifier(fixture));
  });

  test("rejects a symlinked database", () => {
    const fixture = makeFixture();
    const realDatabase = path.join(fixture.root, "real.db");
    fs.renameSync(fixture.databasePath, realDatabase);
    fs.symlinkSync(realDatabase, fixture.databasePath, "file");

    expectGenericFailure(runVerifier(fixture));
  });

  test("rejects an unsafe database filename", () => {
    const fixture = makeFixture();
    const database = new Database(fixture.databasePath);
    try {
      database.prepare("UPDATE media SET filename = ?").run("../escape.png");
    } finally {
      database.close();
    }

    expectGenericFailure(runVerifier(fixture));
  });

  test.each([
    ["relative database", { DATABASE_PATH: "relative.db" }],
    ["relative media", { MEDIA_ROOT: "relative-media" }],
    ["missing database", { DATABASE_PATH: undefined }],
    ["missing media", { MEDIA_ROOT: undefined }],
  ])("rejects %s environment configuration", (_case, environment) => {
    const result = runVerifier(makeFixture(), environment);

    expectGenericFailure(result);
  });
});
