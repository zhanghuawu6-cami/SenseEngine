import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { protectAdmin, conflictError } from "@/lib/http";
import { repository } from "@/lib/repository";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 6 * 1024 * 1024;

function detectImage(buffer: Buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", extension: ".png" };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: "image/jpeg", extension: ".jpg" };
  }
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return { mime: "image/webp", extension: ".webp" };
  }
  return null;
}

export async function GET(request: Request) {
  const denied = await protectAdmin(request);
  if (denied) return denied;
  return NextResponse.json({ media: repository.listMedia() });
}

export async function POST(request: Request) {
  const denied = await protectAdmin(request, true);
  if (denied) return denied;
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "请选择不超过 6MB 的图片" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectImage(buffer);
  if (!detected) {
    return NextResponse.json({ error: "仅支持 PNG、JPG 和 WebP 图片" }, { status: 400 });
  }

  const filename = `${randomUUID()}${detected.extension}`;
  const uploadDirectory = path.join(process.cwd(), "public", "uploads");
  const filePath = path.join(uploadDirectory, filename);
  await fs.mkdir(uploadDirectory, { recursive: true });
  await fs.writeFile(filePath, buffer, { flag: "wx" });
  try {
    const media = repository.createMedia({
      filename,
      originalName: path.basename(file.name).slice(0, 240),
      mimeType: detected.mime,
      size: file.size,
      url: `/uploads/${filename}`,
    });
    return NextResponse.json({ media }, { status: 201 });
  } catch (error) {
    await fs.unlink(filePath).catch(() => undefined);
    return conflictError(error);
  }
}
