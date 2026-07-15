// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalMediaStorage, resolveMediaRoot } from "@/lib/media-storage";

describe("resolveMediaRoot", () => {
  it("keeps the default root outside the public directory", () => {
    const cwd = path.resolve("/srv/senseorder/web");
    const root = resolveMediaRoot(cwd, undefined);

    expect(root).toBe(path.join(cwd, "data", "media"));
    expect(root.startsWith(`${path.join(cwd, "public")}${path.sep}`)).toBe(false);
  });

  it("keeps the MEDIA_ROOT override", () => {
    const cwd = path.resolve("/srv/senseorder/web");

    expect(resolveMediaRoot(cwd, "../mounted-media"))
      .toBe(path.resolve(cwd, "../mounted-media"));
  });
});

describe("LocalMediaStorage", () => {
  let root: string;
  let storage: LocalMediaStorage;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "senseorder-media-"));
    storage = new LocalMediaStorage(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("writes, reads, and deletes an asset", async () => {
    const content = Buffer.from("png bytes");

    await storage.write("asset.png", content);
    await expect(storage.read("asset.png")).resolves.toEqual(content);
    await storage.delete("asset.png");
    await expect(storage.read("asset.png")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to read a symbolic link", async () => {
    const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), "senseorder-external-"));
    const externalFile = path.join(externalRoot, "secret.png");
    await fs.writeFile(externalFile, "secret");
    await fs.symlink(externalFile, path.join(root, "asset.png"));

    try {
      await expect(storage.read("asset.png")).rejects.toMatchObject({
        code: expect.stringMatching(/^(ELOOP|EMLINK)$/),
      });
    } finally {
      await fs.rm(externalRoot, { recursive: true, force: true });
    }
  });

  it.each(["../secret", "nested/file.png", "nested\\file.png", "/tmp/file.png", ""])(
    "rejects unsafe filename %j",
    async (filename) => {
      await expect(storage.write(filename, Buffer.from("unsafe"))).rejects.toThrow("Unsafe media filename");
      await expect(storage.read(filename)).rejects.toThrow("Unsafe media filename");
      await expect(storage.delete(filename)).rejects.toThrow("Unsafe media filename");
    },
  );
});
