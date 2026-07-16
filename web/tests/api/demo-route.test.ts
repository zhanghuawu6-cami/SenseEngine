// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const limiterMocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  constructorOptions: [] as unknown[],
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/sense-engine/rate-limit", () => ({
  DemoRateLimiter: class {
    constructor(options: unknown) {
      limiterMocks.constructorOptions.push(options);
    }

    acquire() {
      return limiterMocks.acquire();
    }
  },
}));

import { POST } from "@/app/api/demo/run/route";
import { GET as GETHealth } from "@/app/api/health/route";
import { DemoUpstreamError } from "@/lib/sense-engine/upstream";

const fixture: unknown = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "../contracts/demo-response.json"), "utf8"),
);

const unavailablePayload = {
  error: {
    code: "demo_unavailable",
    message: "SenseEngine demo is temporarily unavailable.",
  },
};

const rateLimitedMessage = "Too many demo requests. Please try again shortly.";
const privateUrl = "https://private.internal/sense-engine/";
const serviceKey = "service-key-sentinel";
const requestBody = "public-body-sentinel";

type TrackedRequest = {
  request: Request;
  bodyAccessed: () => boolean;
  readers: ReturnType<typeof vi.spyOn>[];
};

function trackedDemoRequest(): TrackedRequest {
  const target = new Request("http://local/api/demo/run", {
    method: "POST",
    body: requestBody,
  });
  const readers = [
    vi.spyOn(target, "json"),
    vi.spyOn(target, "text"),
    vi.spyOn(target, "arrayBuffer"),
    vi.spyOn(target, "formData"),
    vi.spyOn(target, "blob"),
  ];
  let bodyAccessed = false;
  const request = new Proxy(target, {
    get(requestTarget, property) {
      if (property === "body") bodyAccessed = true;
      const value: unknown = Reflect.get(requestTarget, property, requestTarget);
      return typeof value === "function" ? value.bind(requestTarget) : value;
    },
  });

  return { request, bodyAccessed: () => bodyAccessed, readers };
}

function responseWithJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function expectUnavailable(response: Response, release: ReturnType<typeof vi.fn>) {
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const text = await response.text();
  expect(JSON.parse(text)).toEqual(unavailablePayload);
  expect(text).not.toContain(privateUrl);
  expect(text).not.toContain(serviceKey);
  expect(text).not.toContain(requestBody);
  expect(release).toHaveBeenCalledTimes(1);
}

describe("SenseEngine demo proxy", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let release: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    release = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SENSE_ENGINE_PRIVATE_URL", privateUrl);
    vi.stubEnv("SENSE_ENGINE_SERVICE_KEY", serviceKey);
    limiterMocks.acquire.mockReset();
    limiterMocks.acquire.mockReturnValue({ ok: true, release });
  });

  it("constructs one process-wide limiter with the approved fixed limits", () => {
    expect(limiterMocks.constructorOptions).toEqual([{
      limit: 30,
      windowMs: 60_000,
      concurrency: 4,
    }]);
  });

  it("ignores the public body and returns the complete validated fixture", async () => {
    const timeoutSignal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
    fetchMock.mockResolvedValue(responseWithJson(fixture));
    const tracked = trackedDemoRequest();

    const response = await POST(tracked.request);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual(fixture);
    expect(text).not.toContain(privateUrl);
    expect(text).not.toContain(serviceKey);
    expect(text).not.toContain(requestBody);
    expect(tracked.bodyAccessed()).toBe(false);
    for (const reader of tracked.readers) expect(reader).not.toHaveBeenCalled();
    expect(timeout).toHaveBeenCalledWith(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://private.internal/sense-engine/v1/demo/run");
    expect(init).toEqual({
      method: "POST",
      headers: { "X-SenseEngine-Service-Key": serviceKey },
      cache: "no-store",
      redirect: "error",
      signal: timeoutSignal,
    });
    expect(Object.prototype.hasOwnProperty.call(init, "body")).toBe(false);
    expect(Object.keys(init.headers as Record<string, string>)).toEqual([
      "X-SenseEngine-Service-Key",
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it.each(["SENSE_ENGINE_PRIVATE_URL", "SENSE_ENGINE_SERVICE_KEY"])(
    "returns the generic 503 without fetching when %s is missing",
    async (missingVariable) => {
      vi.stubEnv(missingVariable, "");

      const response = await POST(trackedDemoRequest().request);

      await expectUnavailable(response, release);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("does not read an unsuccessful upstream response body", async () => {
    const upstreamResponse = new Response(
      JSON.stringify({ privateUrl, serviceKey, requestBody }),
      { status: 502 },
    );
    const cancel = vi.spyOn(upstreamResponse.body!, "cancel");
    const readers = [
      vi.spyOn(upstreamResponse, "json"),
      vi.spyOn(upstreamResponse, "text"),
      vi.spyOn(upstreamResponse, "arrayBuffer"),
      vi.spyOn(upstreamResponse, "formData"),
      vi.spyOn(upstreamResponse, "blob"),
    ];
    fetchMock.mockResolvedValue(upstreamResponse);

    const response = await POST(trackedDemoRequest().request);

    await expectUnavailable(response, release);
    for (const reader of readers) expect(reader).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
      release.mock.invocationCallOrder[0],
    );
  });

  it("still returns the generic 503 and releases when body cancellation fails", async () => {
    const upstreamResponse = new Response("upstream error", { status: 500 });
    const cancel = vi.spyOn(upstreamResponse.body!, "cancel").mockRejectedValue(
      new Error(`cancel failed ${privateUrl} ${serviceKey}`),
    );
    fetchMock.mockResolvedValue(upstreamResponse);

    const response = await POST(trackedDemoRequest().request);

    await expectUnavailable(response, release);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
      release.mock.invocationCallOrder[0],
    );
  });

  it("does not follow or expose an upstream redirect", async () => {
    const location = `${privateUrl}redirect?key=${serviceKey}&body=${requestBody}`;
    const upstreamResponse = new Response("redirect response", {
      status: 302,
      headers: { Location: location },
    });
    const readers = [
      vi.spyOn(upstreamResponse, "json"),
      vi.spyOn(upstreamResponse, "text"),
      vi.spyOn(upstreamResponse, "arrayBuffer"),
      vi.spyOn(upstreamResponse, "formData"),
      vi.spyOn(upstreamResponse, "blob"),
    ];
    fetchMock.mockResolvedValue(upstreamResponse);

    const response = await POST(trackedDemoRequest().request);

    await expectUnavailable(response, release);
    for (const reader of readers) expect(reader).not.toHaveBeenCalled();
  });

  it("maps invalid upstream JSON to the generic 503", async () => {
    fetchMock.mockResolvedValue(
      new Response(`not-json ${privateUrl} ${serviceKey}`, { status: 200 }),
    );

    await expectUnavailable(await POST(trackedDemoRequest().request), release);
  });

  it.each([
    ["the fixed steps tuple has the wrong length", () => {
      const invalid = structuredClone(fixture) as { steps: unknown[] };
      invalid.steps = invalid.steps.slice(0, 2);
      return invalid;
    }],
    ["an action is outside the public enum", () => {
      const invalid = structuredClone(fixture) as {
        steps: Array<{ intervention: { action: { type: string } } }>;
      };
      invalid.steps[0].intervention.action.type = "Notify";
      return invalid;
    }],
  ])("maps invalid upstream data to the generic 503 when %s", async (_case, makeInvalid) => {
    fetchMock.mockResolvedValue(responseWithJson(makeInvalid()));

    await expectUnavailable(await POST(trackedDemoRequest().request), release);
  });

  it.each([
    ["fetch rejection", new Error(`network failure ${privateUrl} ${serviceKey}`)],
    ["abort", new DOMException(`timed out ${privateUrl}`, "AbortError")],
  ])("maps %s to the generic 503", async (_case, error) => {
    fetchMock.mockRejectedValue(error);

    await expectUnavailable(await POST(trackedDemoRequest().request), release);
  });

  it.each([
    ["window", 27],
    ["concurrency", 1],
  ] as const)("returns a stable 429 for a %s limit without calling upstream", async (reason, retry) => {
    limiterMocks.acquire.mockReturnValue({
      ok: false,
      reason,
      retryAfterSeconds: retry,
    });

    const response = await POST(trackedDemoRequest().request);

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe(String(retry));
    expect(await response.json()).toEqual({
      error: {
        code: "rate_limited",
        message: rateLimitedMessage,
        retry_after_seconds: retry,
      },
    });
    expect(Number.isInteger(retry)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it("uses a fixed upstream error with no sensitive fields", () => {
    const error = new DemoUpstreamError();

    expect(error.name).toBe("DemoUpstreamError");
    expect(error.message).toBe("SenseEngine demo upstream is unavailable.");
    expect(JSON.stringify(error)).not.toContain(privateUrl);
    expect(JSON.stringify(error)).not.toContain(serviceKey);
    expect(Object.keys(error)).toEqual(["name"]);
  });
});

describe("GET /api/health", () => {
  it("returns a no-store liveness response", async () => {
    const response = GETHealth();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "alive" });
  });
});
