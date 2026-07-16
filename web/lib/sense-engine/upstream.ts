import "server-only";

import { demoRunSchema } from "@/lib/sense-engine/schema";

export class DemoUpstreamError extends Error {
  constructor() {
    super("SenseEngine demo upstream is unavailable.");
    this.name = "DemoUpstreamError";
  }
}

export async function runDemoUpstream(fetcher: typeof fetch = fetch) {
  const baseUrl = process.env.SENSE_ENGINE_PRIVATE_URL;
  const serviceKey = process.env.SENSE_ENGINE_SERVICE_KEY;
  if (!baseUrl || !serviceKey) throw new DemoUpstreamError();

  const response = await fetcher(`${baseUrl.replace(/\/+$/, "")}/v1/demo/run`, {
    method: "POST",
    headers: { "X-SenseEngine-Service-Key": serviceKey },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new DemoUpstreamError();
  }

  return demoRunSchema.parse(await response.json());
}
