import fs from "node:fs";
import path from "node:path";
import { act, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import { useDemoRun } from "@/hooks/use-demo-run";
import type { DemoRunState, DemoStatus } from "@/hooks/use-demo-run";

const fixture: unknown = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "../contracts/demo-response.json"), "utf8"),
);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function invalidSchemaFixture(): unknown {
  const invalid = structuredClone(fixture) as { steps: unknown[] };
  invalid.steps = invalid.steps.slice(0, 2);
  return invalid;
}

describe("useDemoRun", () => {
  let fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts idle with a stable run function", () => {
    const { rerender, result } = renderHook(() => useDemoRun());
    const firstRun = result.current.run;

    expect(result.current).toEqual({
      status: "idle",
      isWaking: false,
      data: null,
      errorCode: null,
      run: firstRun,
    });
    expectTypeOf<DemoStatus>().toEqualTypeOf<
      "idle" | "running" | "success" | "unavailable"
    >();
    expectTypeOf(result.current).toEqualTypeOf<DemoRunState>();
    expectTypeOf(result.current.run).toEqualTypeOf<() => Promise<void>>();

    rerender();

    expect(result.current.run).toBe(firstRun);
  });

  it("runs immediately and wakes at exactly two seconds", async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useDemoRun());
    let runPromise!: Promise<void>;

    act(() => {
      runPromise = result.current.run();
    });

    expect(result.current).toMatchObject({
      status: "running",
      isWaking: false,
      data: null,
      errorCode: null,
    });
    await act(async () => vi.advanceTimersByTimeAsync(1_999));
    expect(result.current.isWaking).toBe(false);

    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(result.current.status).toBe("running");
    expect(result.current.isWaking).toBe(true);
    expect(result.current.run).toEqual(expect.any(Function));
    void runPromise;
  });

  it("accepts the complete validated fixture and sends one bodyless no-store POST", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture));
    const { result } = renderHook(() => useDemoRun());

    await act(async () => {
      await result.current.run();
    });

    expect(result.current).toMatchObject({
      status: "success",
      isWaking: false,
      data: fixture,
      errorCode: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/demo/run");
    expect(init).toEqual({
      method: "POST",
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
    expect(Object.prototype.hasOwnProperty.call(init, "body")).toBe(false);
  });

  it.each([
    ["invalid JSON", () => new Response("not-json", { status: 200 })],
    ["an invalid schema", () => jsonResponse(invalidSchemaFixture())],
  ])("maps a successful response containing %s to unavailable", async (_case, response) => {
    fetchMock.mockResolvedValue(response());
    const { result } = renderHook(() => useDemoRun());

    await act(async () => {
      await result.current.run();
    });

    expect(result.current).toMatchObject({
      status: "unavailable",
      isWaking: false,
      data: null,
      errorCode: "demo_unavailable",
    });
  });

  it("maps 429 to rate_limited without parsing its body", async () => {
    fetchMock.mockResolvedValue(new Response("not-json", { status: 429 }));
    const { result } = renderHook(() => useDemoRun());

    await act(async () => {
      await result.current.run();
    });

    expect(result.current).toMatchObject({
      status: "unavailable",
      isWaking: false,
      data: null,
      errorCode: "rate_limited",
    });
  });

  it.each([503, 500])("maps HTTP %i to the generic unavailable state", async (status) => {
    fetchMock.mockResolvedValue(jsonResponse({ private: "do-not-store" }, status));
    const { result } = renderHook(() => useDemoRun());

    await act(async () => {
      await result.current.run();
    });

    expect(result.current).toMatchObject({
      status: "unavailable",
      isWaking: false,
      data: null,
      errorCode: "demo_unavailable",
    });
  });

  it("maps a fetch rejection to the generic unavailable state", async () => {
    fetchMock.mockRejectedValue(new Error("network details must not be saved"));
    const { result } = renderHook(() => useDemoRun());

    await act(async () => {
      await result.current.run();
    });

    expect(result.current).toMatchObject({
      status: "unavailable",
      isWaking: false,
      data: null,
      errorCode: "demo_unavailable",
    });
  });

  it("times out at 20 seconds even when fetch ignores the abort signal", async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useDemoRun());
    let runPromise!: Promise<void>;

    act(() => {
      runPromise = result.current.run();
    });
    const signal = fetchMock.mock.calls[0][1]?.signal;

    await act(async () => vi.advanceTimersByTimeAsync(20_000));

    expect(signal?.aborted).toBe(true);
    expect(result.current).toMatchObject({
      status: "unavailable",
      isWaking: false,
      data: null,
      errorCode: "demo_unavailable",
    });

    await act(async () => {
      pending.resolve(jsonResponse(fixture));
      await runPromise;
    });

    expect(result.current.status).toBe("unavailable");
    expect(result.current.data).toBeNull();
  });

  it("resolves run without throwing when fetch rejects on abort", async () => {
    fetchMock.mockImplementation((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("timed out", "AbortError")),
          { once: true },
        );
      }),
    );
    const { result } = renderHook(() => useDemoRun());
    let runPromise!: Promise<void>;

    act(() => {
      runPromise = result.current.run();
    });
    await act(async () => vi.advanceTimersByTimeAsync(20_000));

    await expect(runPromise).resolves.toBeUndefined();
    expect(result.current).toMatchObject({
      status: "unavailable",
      isWaking: false,
      data: null,
      errorCode: "demo_unavailable",
    });
  });

  it("clears successful data immediately when retrying", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture));
    const { result } = renderHook(() => useDemoRun());
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.status).toBe("success");

    const retry = deferred<Response>();
    fetchMock.mockReturnValueOnce(retry.promise);
    act(() => {
      void result.current.run();
    });

    expect(result.current).toMatchObject({
      status: "running",
      isWaking: false,
      data: null,
      errorCode: null,
    });
  });

  it("clears an unavailable error immediately when retrying", async () => {
    fetchMock.mockResolvedValueOnce(new Response("rate limited", { status: 429 }));
    const { result } = renderHook(() => useDemoRun());
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.errorCode).toBe("rate_limited");

    const retry = deferred<Response>();
    fetchMock.mockReturnValueOnce(retry.promise);
    act(() => {
      void result.current.run();
    });

    expect(result.current).toMatchObject({
      status: "running",
      isWaking: false,
      data: null,
      errorCode: null,
    });
  });

  it("ignores a first request that resolves after the second succeeds", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useDemoRun());
    let firstRun!: Promise<void>;
    let secondRun!: Promise<void>;

    act(() => {
      firstRun = result.current.run();
    });
    const firstSignal = fetchMock.mock.calls[0][1]?.signal;
    act(() => {
      secondRun = result.current.run();
    });
    const secondSignal = fetchMock.mock.calls[1][1]?.signal;

    expect(firstSignal?.aborted).toBe(true);
    expect(secondSignal?.aborted).toBe(false);
    await act(async () => {
      second.resolve(jsonResponse(fixture));
      await secondRun;
    });
    expect(result.current.status).toBe("success");

    await act(async () => {
      first.resolve(new Response("late failure", { status: 503 }));
      await firstRun;
    });

    expect(result.current.status).toBe("success");
    expect(result.current.data).toEqual(fixture);
    expect(result.current.errorCode).toBeNull();
  });

  it("keeps the second request timers when the aborted first request rejects", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useDemoRun());
    let firstRun!: Promise<void>;
    let secondRun!: Promise<void>;

    act(() => {
      firstRun = result.current.run();
      secondRun = result.current.run();
    });
    await act(async () => {
      first.reject(new DOMException("superseded", "AbortError"));
      await firstRun;
    });

    expect(result.current.status).toBe("running");
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(result.current.isWaking).toBe(true);

    await act(async () => {
      second.resolve(jsonResponse(fixture));
      await secondRun;
    });

    expect(result.current.status).toBe("success");
    expect(result.current.isWaking).toBe(false);
  });

  it("aborts and clears timers on unmount without updating after a late response", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pending = deferred<Response>();
    fetchMock.mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => useDemoRun());
    let runPromise!: Promise<void>;

    act(() => {
      runPromise = result.current.run();
    });
    const signal = fetchMock.mock.calls[0][1]?.signal;
    expect(vi.getTimerCount()).toBe(2);

    unmount();

    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    pending.resolve(jsonResponse(fixture));
    await runPromise;
    await Promise.resolve();

    expect(consoleError).not.toHaveBeenCalled();
  });
});
