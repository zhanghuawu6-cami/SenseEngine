import { NextResponse } from "next/server";
import { protectAdmin } from "@/lib/http";
import { repository } from "@/lib/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await protectAdmin(request);
  if (denied) return denied;
  return NextResponse.json({ leads: repository.listLeads() });
}
