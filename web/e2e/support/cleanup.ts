import fs from "node:fs/promises";
import { buildE2EPaths, type E2EPaths } from "./test-paths";

export { buildE2EPaths };

export async function cleanupE2EState(paths: E2EPaths): Promise<void> {
  await Promise.all(
    [paths.databasePath, `${paths.databasePath}-wal`, `${paths.databasePath}-shm`].map(
      (candidate) => fs.rm(candidate, { force: true }),
    ),
  );
  await fs.rm(paths.mediaRoot, { force: true, recursive: true });
  await fs.mkdir(paths.testRoot, { recursive: true });
}

export async function removeE2EState(paths: E2EPaths): Promise<void> {
  await fs.rm(paths.testRoot, { force: true, recursive: true });
}
