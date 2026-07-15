import { NextResponse } from "next/server";
import { protectAdmin, validationError } from "@/lib/http";
import { repository } from "@/lib/repository";
import { leadUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await protectAdmin(request, true);
  if (denied) return denied;
  const parsed = leadUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error.flatten());
  const { id } = await context.params;
  const lead = repository.updateLead(id, parsed.data.status, parsed.data.note);
  if (!lead) return NextResponse.json({ error: "线索不存在" }, { status: 404 });
  return NextResponse.json({ lead });
}
