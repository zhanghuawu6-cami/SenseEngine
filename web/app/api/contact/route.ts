import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/auth";
import { repository } from "@/lib/repository";
import { contactSchema } from "@/lib/validation";

export const runtime = "nodejs";

const globalForRateLimit = globalThis as unknown as {
  senseorderContactRate?: Map<string, number[]>;
};
const attempts = globalForRateLimit.senseorderContactRate || new Map<string, number[]>();
globalForRateLimit.senseorderContactRate = attempts;

function isRateLimited(request: Request) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((timestamp) => now - timestamp < 60 * 60 * 1000);
  if (recent.length >= 5) return true;
  recent.push(now);
  attempts.set(key, recent);
  return false;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  }
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "提交过于频繁，请稍后再试" }, { status: 429 });
  }
  const parsed = contactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "请检查必填信息" }, { status: 400 });
  }
  if (parsed.data.companyWebsite) {
    return NextResponse.json({ ok: true });
  }
  const { companyWebsite: _, ...lead } = parsed.data;
  void _;
  repository.createLead(lead);
  return NextResponse.json({ ok: true }, { status: 201 });
}
