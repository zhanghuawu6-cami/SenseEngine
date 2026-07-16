import fs from "node:fs/promises";
import {
  E2E_DATABASE_PATH,
  E2E_MEDIA_ROOT,
  E2E_TEST_ROOT,
} from "./test-paths";

export async function cleanupE2EState(): Promise<void> {
  await Promise.all(
    [E2E_DATABASE_PATH, `${E2E_DATABASE_PATH}-wal`, `${E2E_DATABASE_PATH}-shm`].map(
      (candidate) => fs.rm(candidate, { force: true }),
    ),
  );
  await fs.rm(E2E_MEDIA_ROOT, { force: true, recursive: true });
  await fs.mkdir(E2E_TEST_ROOT, { recursive: true });
}
