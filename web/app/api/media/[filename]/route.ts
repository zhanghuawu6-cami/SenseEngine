import { NextResponse } from "next/server";
import { isSafeMediaFilename, mediaStorage } from "@/lib/media-storage";
import { repository } from "@/lib/repository";

export const runtime = "nodejs";

function notFound() {
  return NextResponse.json({ error: "图片不存在" }, { status: 404 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  if (!isSafeMediaFilename(filename)) return notFound();

  const media = repository.getMediaByFilename(filename);
  if (!media) return notFound();

  try {
    const content = await mediaStorage.read(filename);
    return new Response(new Uint8Array(content), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(content.length),
        "Content-Type": media.mimeType,
      },
    });
  } catch {
    return notFound();
  }
}
