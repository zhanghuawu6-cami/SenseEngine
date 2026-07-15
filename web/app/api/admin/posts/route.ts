import { NextResponse } from "next/server";
import { protectAdmin, conflictError, validationError } from "@/lib/http";
import { repository } from "@/lib/repository";
import type { ContentType, PublishStatus } from "@/lib/types";
import { postSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await protectAdmin(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") as ContentType | null;
  const status = url.searchParams.get("status") as PublishStatus | null;
  return NextResponse.json({ posts: repository.listPosts({ type: type || undefined, status: status || undefined }) });
}

export async function POST(request: Request) {
  const denied = await protectAdmin(request, true);
  if (denied) return denied;
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error.flatten());
  try {
    const post = repository.createPost(parsed.data);
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    return conflictError(error);
  }
}
