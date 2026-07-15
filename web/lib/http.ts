import { NextResponse } from "next/server";
import { isAdminAuthenticated, isSameOrigin } from "@/lib/auth";

export async function protectAdmin(request: Request, mutate = false) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });
  }
  if (mutate && !isSameOrigin(request)) {
    return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  }
  return null;
}

export function validationError(issues: unknown) {
  return NextResponse.json({ error: "提交内容不完整", issues }, { status: 400 });
}

export function conflictError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("UNIQUE constraint failed")) {
    return NextResponse.json({ error: "Slug 或文件名已经存在" }, { status: 409 });
  }
  console.error(error);
  return NextResponse.json({ error: "服务器暂时无法完成请求" }, { status: 500 });
}
