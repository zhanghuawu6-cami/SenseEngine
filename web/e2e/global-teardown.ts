import fs from "node:fs/promises";
import { E2E_TEST_ROOT } from "./support/test-paths";

export default async function globalTeardown(): Promise<void> {
  await fs.rm(E2E_TEST_ROOT, { force: true, recursive: true });
}
