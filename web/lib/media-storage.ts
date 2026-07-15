import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export function isSafeMediaFilename(filename: string) {
  return Boolean(filename) &&
    filename !== "." &&
    filename !== ".." &&
    !filename.includes("/") &&
    !filename.includes("\\") &&
    !path.isAbsolute(filename);
}

export function resolveMediaRoot(cwd: string, configuredRoot?: string) {
  return path.resolve(cwd, configuredRoot || "./data/media");
}

export class LocalMediaStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(filename: string) {
    if (!isSafeMediaFilename(filename)) {
      throw new Error("Unsafe media filename");
    }
    return path.join(this.root, filename);
  }

  async write(filename: string, content: Buffer) {
    const filePath = this.resolve(filename);
    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(filePath, content, { flag: "wx" });
  }

  async read(filename: string) {
    const file = await fs.open(
      this.resolve(filename),
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    try {
      return await file.readFile();
    } finally {
      await file.close();
    }
  }

  async delete(filename: string) {
    try {
      await fs.unlink(this.resolve(filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export const mediaStorage = new LocalMediaStorage(
  resolveMediaRoot(process.cwd(), process.env.MEDIA_ROOT),
);
