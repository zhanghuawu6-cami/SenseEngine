import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  getDatabase().prepare("SELECT 1").get();
  return NextResponse.json({ status: "ok", service: "senseorder-web" });
}
