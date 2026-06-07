import { NextRequest, NextResponse } from "next/server";
import { deleteCustomCard } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id.startsWith("custom-")) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  await deleteCustomCard(id);
  return NextResponse.json({ ok: true });
}
