import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const E2E_OWNER_MARKER_FILENAME = ".senseorder-e2e-owner";

const checkoutRoot = path.resolve(process.cwd(), "..");

export type E2EPaths = {
  databasePath: string;
  mediaRoot: string;
  ownerMarkerPath: string;
  ownerToken: string;
  testRoot: string;
};

function isSameOrAncestor(candidate: string, target: string): boolean {
  const relative = path.relative(candidate, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertSafeE2ERoot(testRoot: string): string {
  if (!path.isAbsolute(testRoot)) {
    throw new Error("SENSEORDER_E2E_ROOT must be an absolute path");
  }
  const resolvedRoot = path.resolve(testRoot);
  const filesystemRoot = path.parse(resolvedRoot).root;
  if (
    resolvedRoot === filesystemRoot ||
    resolvedRoot === os.homedir() ||
    isSameOrAncestor(resolvedRoot, checkoutRoot)
  ) {
    throw new Error(`Refusing dangerous E2E root: ${resolvedRoot}`);
  }
  return resolvedRoot;
}

export function buildE2EPaths(testRoot: string, ownerToken = ""): E2EPaths {
  const safeRoot = assertSafeE2ERoot(testRoot);
  return {
    databasePath: path.join(safeRoot, "senseorder-e2e.db"),
    mediaRoot: path.join(safeRoot, "media"),
    ownerMarkerPath: path.join(safeRoot, E2E_OWNER_MARKER_FILENAME),
    ownerToken,
    testRoot: safeRoot,
  };
}

export function assertE2EOwnership(paths: E2EPaths): void {
  assertSafeE2ERoot(paths.testRoot);
  let markerToken: string;
  try {
    markerToken = fs.readFileSync(paths.ownerMarkerPath, "utf8").trim();
  } catch {
    throw new Error(`E2E owner marker is missing: ${paths.ownerMarkerPath}`);
  }
  if (!paths.ownerToken || markerToken !== paths.ownerToken) {
    throw new Error(`E2E owner marker does not match: ${paths.ownerMarkerPath}`);
  }
}

export function readE2EPaths(environment: NodeJS.ProcessEnv = process.env): E2EPaths {
  const testRoot = environment.SENSEORDER_E2E_ROOT;
  if (!testRoot) {
    throw new Error("Run Playwright through npm run test:e2e to allocate isolated state");
  }
  const ownerToken = environment.SENSEORDER_E2E_OWNER_TOKEN;
  if (!ownerToken) {
    throw new Error("SENSEORDER_E2E_OWNER_TOKEN must contain the launcher owner token");
  }
  const paths = buildE2EPaths(testRoot, ownerToken);
  assertE2EOwnership(paths);
  return paths;
}
