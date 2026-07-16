import os from "node:os";
import path from "node:path";

const testRoot = path.join(os.tmpdir(), "senseorder-playwright-w6");

export const E2E_DATABASE_PATH = path.join(testRoot, "senseorder-e2e.db");
export const E2E_MEDIA_ROOT = path.join(testRoot, "media");
export const E2E_TEST_ROOT = testRoot;
