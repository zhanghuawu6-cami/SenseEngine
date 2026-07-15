// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalMediaStorage } from "@/lib/media-storage";

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

  it.each(["../secret", "nested/file.png", "nested\\file.png", "/tmp/file.png", ""])(
    "rejects unsafe filename %j",
    async (filename) => {
      await expect(storage.write(filename, Buffer.from("unsafe"))).rejects.toThrow("Unsafe media filename");
      await expect(storage.read(filename)).rejects.toThrow("Unsafe media filename");
      await expect(storage.delete(filename)).rejects.toThrow("Unsafe media filename");
    },
  );
});
