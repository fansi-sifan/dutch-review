import { NextRequest, NextResponse } from "next/server";
import { setCachedTranslation } from "@/lib/db";

// POST /api/translations  body: { itemId: string; translation: string }
export async function POST(req: NextRequest) {
  const { itemId, translation } = await req.json();
  if (!itemId || !translation) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  setCachedTranslation(itemId, translation);
  return NextResponse.json({ ok: true });
}
