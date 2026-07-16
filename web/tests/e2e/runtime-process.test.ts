import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { superviseChildProcess } from "../../e2e/runtime-process.mjs";

class FakeChild extends EventEmitter {
  readonly forwardedSignals: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals): boolean {
    this.forwardedSignals.push(signal);
    return true;
  }
}

describe("Playwright child process supervision", () => {
  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const)("forwards %s, waits for child exit, and returns %i", async (signal, exitCode) => {
    const child = new FakeChild();
    const signalSource = new EventEmitter();
    let settled = false;
    const resultPromise = superviseChildProcess(child, signalSource).then((result) => {
      settled = true;
      return result;
    });

    signalSource.emit(signal);
    await Promise.resolve();

    expect(child.forwardedSignals).toEqual([signal]);
    expect(settled).toBe(false);

    child.emit("exit", null, signal);

    await expect(resultPromise).resolves.toBe(exitCode);
    expect(signalSource.listenerCount("SIGINT")).toBe(0);
    expect(signalSource.listenerCount("SIGTERM")).toBe(0);
  });

  it("forwards only the first shutdown signal", async () => {
    const child = new FakeChild();
    const signalSource = new EventEmitter();
    const resultPromise = superviseChildProcess(child, signalSource);

    signalSource.emit("SIGTERM");
    signalSource.emit("SIGINT");
    child.emit("exit", null, "SIGTERM");

    await expect(resultPromise).resolves.toBe(143);
    expect(child.forwardedSignals).toEqual(["SIGTERM"]);
  });
});
