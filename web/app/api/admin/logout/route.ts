import { NextResponse } from "next/server";
import { clearAdminSession, isSameOrigin } from "@/lib/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  }
  await clearAdminSession();
  return NextResponse.json({ ok: true });
}
