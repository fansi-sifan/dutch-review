import { NextRequest, NextResponse } from "next/server";
import { getCustomCards, createCustomCard } from "@/lib/db";

export async function GET() {
  const cards = await getCustomCards();
  return NextResponse.json({ cards });
}

export async function POST(req: NextRequest) {
  const { dutch, english } = await req.json();
  if (!dutch?.trim()) {
    return NextResponse.json({ error: "Dutch sentence required" }, { status: 400 });
  }
  const id = await createCustomCard(dutch, english);
  return NextResponse.json({ id });
}
