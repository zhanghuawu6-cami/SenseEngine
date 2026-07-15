import { NextResponse } from "next/server";
import { protectAdmin, validationError } from "@/lib/http";
import { repository } from "@/lib/repository";
import { settingsSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await protectAdmin(request);
  if (denied) return denied;
  return NextResponse.json({ settings: repository.getSettings() });
}

export async function PUT(request: Request) {
  const denied = await protectAdmin(request, true);
  if (denied) return denied;
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error.flatten());
  return NextResponse.json({ settings: repository.updateSettings(parsed.data) });
}
