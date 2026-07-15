import { NextResponse } from "next/server";
import { protectAdmin, conflictError, validationError } from "@/lib/http";
import { repository } from "@/lib/repository";
import { postSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await protectAdmin(request, true);
  if (denied) return denied;
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error.flatten());
  const { id } = await context.params;
  try {
    const post = repository.updatePost(id, parsed.data);
    if (!post) return NextResponse.json({ error: "内容不存在" }, { status: 404 });
    return NextResponse.json({ post });
  } catch (error) {
    return conflictError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await protectAdmin(request, true);
  if (denied) return denied;
  const { id } = await context.params;
  if (!repository.deletePost(id)) {
    return NextResponse.json({ error: "内容不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
