import { NextRequest, NextResponse } from "next/server";
import {
  recordReview,
  getDueItems,
  getAllCardStates,
  getWeakItems,
  getReviewStreak,
  getReviewCalendar,
} from "@/lib/db";
import { getItemsByIds, getNewItems } from "@/lib/content";
import type { ReviewResult } from "@/types";

// GET /api/reviews?units=1,2,3,4,5,6  → returns session cards
export async function GET(req: NextRequest) {
  const unitsParam = req.nextUrl.searchParams.get("units") ?? "1,2,3,4,5";
  const unlockedUnits = unitsParam.split(",").map(Number).filter(Boolean);
  const sessionSize = 20;

  // Due cards from SRS
  const dueIds = getDueItems(unlockedUnits, sessionSize);
  const dueCards = getItemsByIds(dueIds);

  // Fill remaining slots with new (never-seen) items
  const allStates = getAllCardStates();
  const seenIds = new Set(allStates.map((s) => s.itemId));
  const needed = Math.max(0, sessionSize - dueCards.length);
  const newCards = getNewItems(unlockedUnits, seenIds, needed);

  // Attach SRS state to due cards
  const stateMap = Object.fromEntries(allStates.map((s) => [s.itemId, s]));
  const withState = dueCards.map((c) => ({ ...c, state: stateMap[c.itemId] ?? null }));

  const cards = [...withState, ...newCards];

  return NextResponse.json({ cards, total: cards.length });
}

// POST /api/reviews  body: ReviewResult[]
export async function POST(req: NextRequest) {
  const results: ReviewResult[] = await req.json();
  const updated = results.map((r) =>
    recordReview(r.itemId, r.rating, r.responseTimeMs)
  );
  return NextResponse.json({ updated });
}
