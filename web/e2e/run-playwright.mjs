import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { superviseChildProcess } from "./runtime-process.mjs";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkoutRoot = path.resolve(webRoot, "..");
const checkoutLock = path.join(webRoot, ".playwright-run.lock");
const ownerMarkerFilename = ".senseorder-e2e-owner";

function parseExplicitPort(value, name) {
  if (value === undefined) return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer TCP port`);
  }
  return port;
}

async function findAvailablePort(explicitPort, excludedPort) {
  const requested = explicitPort ?? 0;
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: requested, exclusive: true }, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a TCP port")));
        return;
      }
      if (address.port === excludedPort) {
        server.close(() => {
          if (explicitPort !== null) {
            reject(new Error("Playwright API and Web ports must differ"));
          } else {
            void findAvailablePort(null, excludedPort).then(resolve, reject);
          }
        });
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function isSameOrAncestor(candidate, target) {
  const relative = path.relative(candidate, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertSafeRuntimeRoot(testRoot) {
  if (!path.isAbsolute(testRoot)) {
    throw new Error("SENSEORDER_E2E_ROOT must be an absolute path");
  }
  const resolvedRoot = path.resolve(testRoot);
  if (
    resolvedRoot === path.parse(resolvedRoot).root ||
    resolvedRoot === os.homedir() ||
    isSameOrAncestor(resolvedRoot, checkoutRoot)
  ) {
    throw new Error(`Refusing dangerous E2E root: ${resolvedRoot}`);
  }
  return resolvedRoot;
}

function removeOwnedRuntimeRoot(runtime) {
  if (!fs.existsSync(runtime.testRoot)) return;
  assertSafeRuntimeRoot(runtime.testRoot);
  const markerPath = path.join(runtime.testRoot, ownerMarkerFilename);
  let markerToken;
  try {
    markerToken = fs.readFileSync(markerPath, "utf8").trim();
  } catch {
    throw new Error(`E2E owner marker is missing: ${markerPath}`);
  }
  if (markerToken !== runtime.ownerToken) {
    throw new Error(`E2E owner marker does not match: ${markerPath}`);
  }
  fs.rmSync(runtime.testRoot, { force: true, recursive: true });
}

function acquireCheckoutLock() {
  const owner = {
    format: "senseorder-playwright-lock-v1",
    hostname: os.hostname(),
    ownerToken: randomUUID(),
    pid: process.pid,
  };
  try {
    fs.writeFileSync(checkoutLock, `${JSON.stringify(owner)}\n`, { flag: "wx" });
    return owner;
  } catch (error) {
    if (error?.code === "EEXIST") {
      let existingOwner = {};
      try {
        existingOwner = JSON.parse(fs.readFileSync(checkoutLock, "utf8"));
      } catch {
        // A malformed lock is still treated as active and must be inspected manually.
      }
      const ownerPid = existingOwner.pid ?? "unknown";
      const ownerHost = existingOwner.hostname ?? "unknown";
      throw new Error(
        `Playwright build lock exists at ${checkoutLock}; owner PID ${ownerPid} on host ` +
        `${ownerHost}. Confirm the owner process is no longer running, then delete the lock ` +
        `manually: ${checkoutLock}`,
      );
    }
    throw error;
  }
}

function releaseCheckoutLock(owner) {
  if (owner === null) return;
  let currentOwner;
  try {
    currentOwner = JSON.parse(fs.readFileSync(checkoutLock, "utf8"));
  } catch {
    throw new Error(`Refusing to remove unreadable Playwright build lock: ${checkoutLock}`);
  }
  if (
    currentOwner.format !== owner.format ||
    currentOwner.hostname !== owner.hostname ||
    currentOwner.ownerToken !== owner.ownerToken ||
    currentOwner.pid !== owner.pid
  ) {
    throw new Error(`Refusing to remove Playwright build lock owned by another process: ${checkoutLock}`);
  }
  fs.rmSync(checkoutLock, { force: true });
}

async function createRuntimeEnvironment() {
  const runId = process.env.SENSEORDER_E2E_RUN_ID ?? `${process.pid}`;
  const configuredRoot = process.env.SENSEORDER_E2E_ROOT;
  const safeConfiguredRoot = configuredRoot === undefined
    ? null
    : assertSafeRuntimeRoot(configuredRoot);
  if (safeConfiguredRoot !== null && fs.existsSync(safeConfiguredRoot)) {
    throw new Error("SENSEORDER_E2E_ROOT must not already exist");
  }
  const explicitApiPort = parseExplicitPort(
    process.env.SENSEORDER_E2E_API_PORT,
    "SENSEORDER_E2E_API_PORT",
  );
  const explicitWebPort = parseExplicitPort(
    process.env.SENSEORDER_E2E_WEB_PORT,
    "SENSEORDER_E2E_WEB_PORT",
  );
  if (explicitApiPort !== null && explicitApiPort === explicitWebPort) {
    throw new Error("Playwright API and Web ports must differ");
  }

  let apiPort;
  let webPort;
  if (explicitWebPort !== null && explicitApiPort === null) {
    webPort = await findAvailablePort(explicitWebPort, null);
    apiPort = await findAvailablePort(null, webPort);
  } else {
    apiPort = await findAvailablePort(explicitApiPort, null);
    webPort = await findAvailablePort(explicitWebPort, apiPort);
  }

  let testRoot;
  if (safeConfiguredRoot === null) {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), `senseorder-playwright-${runId}-`));
  } else {
    try {
      fs.mkdirSync(safeConfiguredRoot);
      testRoot = safeConfiguredRoot;
    } catch (error) {
      if (error?.code === "EEXIST") {
        throw new Error("SENSEORDER_E2E_ROOT must not already exist");
      }
      throw error;
    }
  }
  const ownerToken = randomUUID();
  const ownerMarkerPath = path.join(testRoot, ownerMarkerFilename);
  try {
    fs.writeFileSync(ownerMarkerPath, `${ownerToken}\n`, { flag: "wx" });
  } catch (error) {
    fs.rmSync(ownerMarkerPath, { force: true });
    fs.rmdirSync(testRoot);
    throw error;
  }
  return { apiPort, ownerToken, testRoot, webPort };
}

function runPlaywright(runtime, arguments_) {
  const cli = path.join(webRoot, "node_modules", "@playwright", "test", "cli.js");
  const child = spawn(process.execPath, [cli, "test", ...arguments_], {
    cwd: webRoot,
    env: {
      ...process.env,
      SENSEORDER_E2E_API_PORT: String(runtime.apiPort),
      SENSEORDER_E2E_OWNER_TOKEN: runtime.ownerToken,
      SENSEORDER_E2E_ROOT: runtime.testRoot,
      SENSEORDER_E2E_WEB_PORT: String(runtime.webPort),
    },
    stdio: "inherit",
  });
  return superviseChildProcess(child, process);
}

async function main() {
  const printRuntime = process.argv.includes("--print-runtime");
  const arguments_ = process.argv.slice(2).filter((value) => value !== "--print-runtime");
  let lockOwner = null;
  let runtime = null;

  try {
    if (!printRuntime) lockOwner = acquireCheckoutLock();
    runtime = await createRuntimeEnvironment();
    if (printRuntime) {
      process.stdout.write(`${JSON.stringify(runtime)}\n`);
      return;
    }
    process.exitCode = await runPlaywright(runtime, arguments_);
  } finally {
    try {
      if (runtime !== null) removeOwnedRuntimeRoot(runtime);
    } finally {
      releaseCheckoutLock(lockOwner);
    }
  }
}

await main();
