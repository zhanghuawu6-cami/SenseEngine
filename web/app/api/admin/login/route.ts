import { NextResponse } from "next/server";
import { createAdminSession, isSameOrigin, verifyCredentials } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  }
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入有效的账号和密码" }, { status: 400 });
  }
  if (!verifyCredentials(parsed.data.email, parsed.data.password)) {
    return NextResponse.json({ error: "账号或密码不正确" }, { status: 401 });
  }
  await createAdminSession(parsed.data.email);
  return NextResponse.json({ ok: true });
}
