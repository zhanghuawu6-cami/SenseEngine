import path from "node:path";

export type E2EPaths = {
  databasePath: string;
  mediaRoot: string;
  testRoot: string;
};

export function buildE2EPaths(testRoot: string): E2EPaths {
  if (!path.isAbsolute(testRoot)) {
    throw new Error("SENSEORDER_E2E_ROOT must be an absolute path");
  }
  return {
    databasePath: path.join(testRoot, "senseorder-e2e.db"),
    mediaRoot: path.join(testRoot, "media"),
    testRoot,
  };
}

export function readE2EPaths(environment: NodeJS.ProcessEnv = process.env): E2EPaths {
  const testRoot = environment.SENSEORDER_E2E_ROOT;
  if (!testRoot) {
    throw new Error("Run Playwright through npm run test:e2e to allocate isolated state");
  }
  return buildE2EPaths(testRoot);
}
