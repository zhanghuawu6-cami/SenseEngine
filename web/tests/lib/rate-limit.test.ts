// @vitest-environment node

import { describe, expect, it } from "vitest";
import { DemoRateLimiter } from "@/lib/sense-engine/rate-limit";

function createLimiter(
  now: () => number,
  overrides: Partial<{ limit: number; windowMs: number; concurrency: number }> = {},
) {
  return new DemoRateLimiter({
    limit: 30,
    windowMs: 60_000,
    concurrency: 4,
    now,
    ...overrides,
  });
}

describe("DemoRateLimiter", () => {
  it("allows four active leases and rejects the fifth for one second", () => {
    const limiter = createLimiter(() => 0);

    const leases = Array.from({ length: 4 }, () => limiter.acquire());

    expect(leases.every((lease) => lease.ok)).toBe(true);
    expect(limiter.acquire()).toEqual({
      ok: false,
      reason: "concurrency",
      retryAfterSeconds: 1,
    });
  });

  it("releases active capacity exactly once without restoring window quota", () => {
    const limiter = createLimiter(() => 0, { limit: 5, concurrency: 2 });
    const first = limiter.acquire();
    const second = limiter.acquire();
    expect(first.ok && second.ok).toBe(true);

    if (!first.ok || !second.ok) throw new Error("expected leases");
    first.release();
    first.release();

    const replacement = limiter.acquire();
    expect(replacement.ok).toBe(true);
    expect(limiter.acquire()).toEqual({
      ok: false,
      reason: "concurrency",
      retryAfterSeconds: 1,
    });

    second.release();
    if (!replacement.ok) throw new Error("expected replacement lease");
    replacement.release();

    expect(limiter.acquire().ok).toBe(true);
    expect(limiter.acquire().ok).toBe(true);
    expect(limiter.acquire()).toEqual({
      ok: false,
      reason: "window",
      retryAfterSeconds: 60,
    });
  });

  it("does not charge concurrency failures against the fixed-window quota", () => {
    const limiter = createLimiter(() => 0, { limit: 3, concurrency: 1 });
    const first = limiter.acquire();
    expect(first.ok).toBe(true);

    expect(limiter.acquire()).toMatchObject({ ok: false, reason: "concurrency" });
    expect(limiter.acquire()).toMatchObject({ ok: false, reason: "concurrency" });

    if (!first.ok) throw new Error("expected first lease");
    first.release();
    const second = limiter.acquire();
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("expected second lease");
    second.release();

    const third = limiter.acquire();
    expect(third.ok).toBe(true);
    if (!third.ok) throw new Error("expected third lease");
    third.release();

    expect(limiter.acquire()).toMatchObject({ ok: false, reason: "window" });
  });

  it("rejects the thirty-first accepted request until the remaining window expires", () => {
    let now = 0;
    const limiter = createLimiter(() => now);

    for (let accepted = 0; accepted < 30; accepted += 1) {
      const lease = limiter.acquire();
      expect(lease.ok).toBe(true);
      if (!lease.ok) throw new Error("expected lease");
      lease.release();
    }

    now = 1_500;
    expect(limiter.acquire()).toEqual({
      ok: false,
      reason: "window",
      retryAfterSeconds: 59,
    });
  });

  it("starts a fresh quota exactly at the fixed-window boundary", () => {
    let now = 10_000;
    const limiter = createLimiter(() => now, { limit: 1 });
    const first = limiter.acquire();
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("expected first lease");
    first.release();

    now = 69_999;
    expect(limiter.acquire()).toEqual({
      ok: false,
      reason: "window",
      retryAfterSeconds: 1,
    });

    now = 70_000;
    expect(limiter.acquire().ok).toBe(true);
  });

  it("starts a fresh window when the injected clock moves backward", () => {
    let now = 10_000;
    const limiter = createLimiter(() => now, { limit: 1 });
    const first = limiter.acquire();
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("expected first lease");
    first.release();

    now = 0;
    const afterRollback = limiter.acquire();

    if (!afterRollback.ok) {
      expect(afterRollback.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
    expect(afterRollback.ok).toBe(true);
  });

  it("keeps active leases counted when a new fixed window begins", () => {
    let now = 0;
    const limiter = createLimiter(() => now, { limit: 2, concurrency: 2 });
    const oldWindowLease = limiter.acquire();
    expect(oldWindowLease.ok).toBe(true);

    now = 60_000;
    const newWindowLease = limiter.acquire();
    expect(newWindowLease.ok).toBe(true);
    expect(limiter.acquire()).toEqual({
      ok: false,
      reason: "concurrency",
      retryAfterSeconds: 1,
    });

    if (!oldWindowLease.ok) throw new Error("expected old-window lease");
    oldWindowLease.release();
    expect(limiter.acquire().ok).toBe(true);
    expect(limiter.acquire()).toMatchObject({
      ok: false,
      reason: "window",
    });
  });
});
