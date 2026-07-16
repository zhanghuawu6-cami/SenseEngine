import { NextResponse } from "next/server";
import { DemoRateLimiter } from "@/lib/sense-engine/rate-limit";
import { runDemoUpstream } from "@/lib/sense-engine/upstream";

export const runtime = "nodejs";

const limiter = new DemoRateLimiter({
  limit: 30,
  windowMs: 60_000,
  concurrency: 4,
});

const noStoreHeaders = { "Cache-Control": "no-store" };
const unavailablePayload = {
  error: {
    code: "demo_unavailable",
    message: "SenseEngine demo is temporarily unavailable.",
  },
};
const rateLimitedMessage = "Too many demo requests. Please try again shortly.";

export async function POST(request: Request) {
  void request;
  const lease = limiter.acquire();
  if (!lease.ok) {
    const retryAfterSeconds = lease.retryAfterSeconds;
    return NextResponse.json(
      {
        error: {
          code: "rate_limited",
          message: rateLimitedMessage,
          retry_after_seconds: retryAfterSeconds,
        },
      },
      {
        status: 429,
        headers: {
          ...noStoreHeaders,
          "Retry-After": String(retryAfterSeconds),
        },
      },
    );
  }

  try {
    const data = await runDemoUpstream();
    return NextResponse.json(data, { headers: noStoreHeaders });
  } catch {
    return NextResponse.json(unavailablePayload, {
      status: 503,
      headers: noStoreHeaders,
    });
  } finally {
    lease.release();
  }
}
