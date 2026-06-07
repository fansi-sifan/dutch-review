import { NextRequest, NextResponse } from "next/server";
import {
  recordReview,
  getDueItems,
  getAllCardStates,
  getLearnedItemIds,
  getCachedTranslations,
} from "@/lib/db";
import { getItemsByIds, getNewItems, getItemsForUnits } from "@/lib/content";
import type { ReviewResult } from "@/types";

// GET /api/reviews?units=1,2,3,4,5,6[&mode=reverse]
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const unitsParam = url.searchParams.get("units") ?? "1,2,3,4,5";
  const mode = url.searchParams.get("mode") ?? "forward";
  const unlockedUnits = unitsParam.split(",").map(Number).filter(Boolean);
  const sessionSize = 20;

  const allStates = await getAllCardStates();
  const stateMap = Object.fromEntries(allStates.map((s) => [s.itemId, s]));

  let cards;

  if (mode === "reverse") {
    const allItems = getItemsForUnits(unlockedUnits);
    const learnedIds = await getLearnedItemIds(allItems.map((i) => i.itemId));
    if (!learnedIds.length) {
      return NextResponse.json({ cards: [], total: 0 });
    }
    const shuffled = [...learnedIds].sort(() => Math.random() - 0.5).slice(0, sessionSize);
    cards = getItemsByIds(shuffled).map((c) => ({ ...c, state: stateMap[c.itemId] ?? null }));
  } else {
    const dueIds = await getDueItems(unlockedUnits, sessionSize);
    const dueCards = getItemsByIds(dueIds);
    const seenIds = new Set(allStates.map((s) => s.itemId));
    const needed = Math.max(0, sessionSize - dueCards.length);
    const newCards = getNewItems(unlockedUnits, seenIds, needed);
    const withState = dueCards.map((c) => ({ ...c, state: stateMap[c.itemId] ?? null }));
    cards = [...withState, ...newCards];
  }

  const translationMap = await getCachedTranslations(cards.map((c) => c.itemId));
  const cardsWithTranslations = cards.map((c) => ({
    ...c,
    translation: translationMap[c.itemId] ?? undefined,
  }));

  return NextResponse.json({ cards: cardsWithTranslations, total: cardsWithTranslations.length });
}

// POST /api/reviews  body: ReviewResult[]  (forward sessions only)
export async function POST(req: NextRequest) {
  const results: ReviewResult[] = await req.json();
  const updated = await Promise.all(
    results.map((r) => recordReview(r.itemId, r.rating, r.responseTimeMs))
  );
  return NextResponse.json({ updated });
}
