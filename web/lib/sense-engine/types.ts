import type { paths } from "@/lib/generated/sense-engine-api";

export type DemoPost = paths["/v1/demo/run"]["post"];
export type DemoRunResponse = DemoPost["responses"][200]["content"]["application/json"];
export type DemoStep = DemoRunResponse["steps"][number];
export type DemoAction = DemoStep["intervention"]["action"];

export type DemoPublicError = {
  code: "demo_unavailable" | "rate_limited";
  message: string;
  retry_after_seconds?: number;
};
