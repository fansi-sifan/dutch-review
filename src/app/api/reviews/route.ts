import { NextRequest, NextResponse } from "next/server";
import {
  recordReview,
  getDueItems,
  getAllCardStates,
  getLearnedItemIds,
} from "@/lib/db";
import { getItemsByIds, getNewItems, getItemsForUnits } from "@/lib/content";
import type { ReviewResult } from "@/types";

// GET /api/reviews?units=1,2,3,4,5,6[&mode=reverse]  → returns session cards
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const unitsParam = url.searchParams.get("units") ?? "1,2,3,4,5";
  const mode = url.searchParams.get("mode") ?? "forward";
  const unlockedUnits = unitsParam.split(",").map(Number).filter(Boolean);
  const sessionSize = 20;

  const allStates = getAllCardStates();
  const stateMap = Object.fromEntries(allStates.map((s) => [s.itemId, s]));

  if (mode === "reverse") {
    const allItems = getItemsForUnits(unlockedUnits);
    const learnedIds = getLearnedItemIds(allItems.map((i) => i.itemId));
    if (!learnedIds.length) {
      return NextResponse.json({ cards: [], total: 0 });
    }
    const shuffled = [...learnedIds].sort(() => Math.random() - 0.5).slice(0, sessionSize);
    const cards = getItemsByIds(shuffled).map((c) => ({ ...c, state: stateMap[c.itemId] ?? null }));
    return NextResponse.json({ cards, total: cards.length });
  }

  // Forward mode: due cards first, then new items
  const dueIds = getDueItems(unlockedUnits, sessionSize);
  const dueCards = getItemsByIds(dueIds);

  const seenIds = new Set(allStates.map((s) => s.itemId));
  const needed = Math.max(0, sessionSize - dueCards.length);
  const newCards = getNewItems(unlockedUnits, seenIds, needed);

  const withState = dueCards.map((c) => ({ ...c, state: stateMap[c.itemId] ?? null }));
  const cards = [...withState, ...newCards];

  return NextResponse.json({ cards, total: cards.length });
}

// POST /api/reviews  body: ReviewResult[]  (only called for forward sessions)
export async function POST(req: NextRequest) {
  const results: ReviewResult[] = await req.json();
  const updated = results.map((r) =>
    recordReview(r.itemId, r.rating, r.responseTimeMs)
  );
  return NextResponse.json({ updated });
}
