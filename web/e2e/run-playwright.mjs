import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkoutLock = path.join(webRoot, ".playwright-run.lock");

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
          void findAvailablePort(null, excludedPort).then(resolve, reject);
        });
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function acquireCheckoutLock() {
  try {
    fs.writeFileSync(checkoutLock, String(process.pid), { flag: "wx" });
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(
        "Another Playwright production build is active in this checkout; wait for it to finish.",
      );
    }
    throw error;
  }
}

function releaseCheckoutLock(acquired) {
  if (!acquired) return;
  fs.rmSync(checkoutLock, { force: true });
}

async function createRuntimeEnvironment() {
  const runId = process.env.SENSEORDER_E2E_RUN_ID ?? `${process.pid}`;
  const configuredRoot = process.env.SENSEORDER_E2E_ROOT;
  if (configuredRoot !== undefined && !path.isAbsolute(configuredRoot)) {
    throw new Error("SENSEORDER_E2E_ROOT must be an absolute path");
  }
  const apiPort = await findAvailablePort(
    parseExplicitPort(process.env.SENSEORDER_E2E_API_PORT, "SENSEORDER_E2E_API_PORT"),
    null,
  );
  const webPort = await findAvailablePort(
    parseExplicitPort(process.env.SENSEORDER_E2E_WEB_PORT, "SENSEORDER_E2E_WEB_PORT"),
    apiPort,
  );
  let testRoot;
  if (configuredRoot === undefined) {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), `senseorder-playwright-${runId}-`));
  } else {
    try {
      fs.mkdirSync(configuredRoot);
      testRoot = configuredRoot;
    } catch (error) {
      if (error?.code === "EEXIST") {
        throw new Error("SENSEORDER_E2E_ROOT must not already exist");
      }
      throw error;
    }
  }
  return { apiPort, testRoot, webPort };
}

function runPlaywright(runtime, arguments_) {
  const cli = path.join(webRoot, "node_modules", "@playwright", "test", "cli.js");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "test", ...arguments_], {
      cwd: webRoot,
      env: {
        ...process.env,
        SENSEORDER_E2E_API_PORT: String(runtime.apiPort),
        SENSEORDER_E2E_ROOT: runtime.testRoot,
        SENSEORDER_E2E_WEB_PORT: String(runtime.webPort),
      },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) reject(new Error(`Playwright exited from signal ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

async function main() {
  const printRuntime = process.argv.includes("--print-runtime");
  const arguments_ = process.argv.slice(2).filter((value) => value !== "--print-runtime");
  let lockAcquired = false;
  let runtime = null;

  try {
    if (!printRuntime) lockAcquired = acquireCheckoutLock();
    runtime = await createRuntimeEnvironment();
    if (printRuntime) {
      process.stdout.write(`${JSON.stringify(runtime)}\n`);
      return;
    }
    process.exitCode = await runPlaywright(runtime, arguments_);
  } finally {
    if (runtime !== null) fs.rmSync(runtime.testRoot, { force: true, recursive: true });
    releaseCheckoutLock(lockAcquired);
  }
}

await main();
