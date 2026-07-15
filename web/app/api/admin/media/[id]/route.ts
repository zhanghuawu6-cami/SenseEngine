import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { protectAdmin } from "@/lib/http";
import { repository } from "@/lib/repository";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await protectAdmin(request, true);
  if (denied) return denied;
  const { id } = await context.params;
  const media = repository.getMedia(id);
  if (!media) return NextResponse.json({ error: "图片不存在" }, { status: 404 });
  repository.deleteMedia(id);
  const safeFilename = path.basename(media.filename);
  await fs.unlink(path.join(process.cwd(), "public", "uploads", safeFilename)).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
