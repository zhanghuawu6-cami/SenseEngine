import { NextResponse } from "next/server";
import { isSafeMediaFilename, mediaStorage } from "@/lib/media-storage";
import { repository } from "@/lib/repository";

export const runtime = "nodejs";

function notFound() {
  return NextResponse.json({ error: "图片不存在" }, { status: 404 });
}

function storageErrorCode(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
  return typeof code === "string" ? code : "UNKNOWN";
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
  } catch (error) {
    const code = storageErrorCode(error);
    if (code === "ENOENT" || code === "ELOOP" || code === "EMLINK") return notFound();
    console.error("media_storage_read_failed", code);
    return NextResponse.json(
      { error: "服务器暂时无法完成请求" },
      { status: 500 },
    );
  }
}
