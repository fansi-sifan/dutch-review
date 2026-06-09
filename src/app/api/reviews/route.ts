import { NextRequest, NextResponse } from "next/server";
import {
  recordReview,
  getDueItems,
  getAllCardStates,
  getLearnedItemIds,
  getCachedTranslations,
  getCustomCardsByIds,
  getNewCustomCards,
  type CustomCard,
} from "@/lib/db";
import { getItemsByIds, getNewItems, getItemsForUnits } from "@/lib/content";
import type { ReviewCard, ReviewResult } from "@/types";

function customToReviewCard(card: CustomCard, state: ReviewCard["state"]): ReviewCard {
  return {
    itemId: card.id,
    unitId: "custom",
    unitName: "My Vocabulary",
    lessonId: "custom",
    lessonType: "Custom",
    sentences: [card.dutch],
    audioFolder: "",
    lessonAudio: {},
    state,
    translation: card.english ?? undefined,
  };
}

// GET /api/reviews?units=1,2,3,4,5,6[&mode=reverse]
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const unitsParam = url.searchParams.get("units") ?? "1,2,3,4,5";
  const mode = url.searchParams.get("mode") ?? "forward";
  const unlockedUnits = unitsParam.split(",").map(Number).filter(Boolean);
  const sessionSize = 20;

  const allStates = await getAllCardStates();
  const stateMap = Object.fromEntries(allStates.map((s) => [s.itemId, s]));
  const seenIds = new Set(allStates.map((s) => s.itemId));

  let cards: ReviewCard[];

  if (mode === "reverse") {
    const allItems = getItemsForUnits(unlockedUnits);
    const allEligibleIds = [...allItems.map((i) => i.itemId), ...Array.from(seenIds).filter(id => id.startsWith("custom-"))];
    const learnedIds = await getLearnedItemIds(allEligibleIds);

    const customLearnedIds = learnedIds.filter((id) => id.startsWith("custom-"));
    const contentLearnedIds = learnedIds.filter((id) => !id.startsWith("custom-"));

    if (!learnedIds.length) return NextResponse.json({ cards: [], total: 0 });

    // Return ALL learned cards shuffled — no cap.
    // Reverse practice is a finite session; the client uses fetchMore → [] to end naturally.
    const allShuffled = [...contentLearnedIds, ...customLearnedIds].sort(() => Math.random() - 0.5);

    const contentCards = getItemsByIds(allShuffled.filter(id => !id.startsWith("custom-")));
    const customRaw = await getCustomCardsByIds(allShuffled.filter(id => id.startsWith("custom-")));
    const customCards = customRaw.map(c => customToReviewCard(c, stateMap[c.id] ?? null));

    cards = [...contentCards.map(c => ({ ...c, state: stateMap[c.itemId] ?? null })), ...customCards];
  } else {
    // Blended session: 12 due (up to 4 shown in reverse) + 8 new
    const newCardSlots = 8;
    const maxDue = sessionSize - newCardSlots;   // 12
    const reverseSlots = 4; // how many due cards to flip to reverse

    const allDueIds = await getDueItems(unlockedUnits, maxDue);
    const customDueIds = allDueIds.filter((id) => id.startsWith("custom-"));
    const contentDueIds = allDueIds.filter((id) => !id.startsWith("custom-"));

    const contentDueCards = getItemsByIds(contentDueIds).map(c => ({ ...c, state: stateMap[c.itemId] ?? null }));
    const customDueRaw = await getCustomCardsByIds(customDueIds);
    const customDueCards = customDueRaw.map(c => customToReviewCard(c, stateMap[c.id] ?? null));

    const dueCards = [...contentDueCards, ...customDueCards];

    // Cards with repetitions >= 2 are established enough to practice in reverse
    const eligibleForReverse = dueCards.filter(
      (c) => (stateMap[c.itemId]?.repetitions ?? 0) >= 2
    );
    const reverseSet = new Set(
      eligibleForReverse
        .sort(() => Math.random() - 0.5)
        .slice(0, reverseSlots)
        .map((c) => c.itemId)
    );

    const taggedDue = dueCards.map((c) => ({
      ...c,
      reviewMode: reverseSet.has(c.itemId) ? ("reverse" as const) : ("forward" as const),
    }));

    // New cards: always forward
    const remaining = Math.max(newCardSlots, sessionSize - taggedDue.length);
    const newCustomRaw = await getNewCustomCards(seenIds);
    const newCustomCards = newCustomRaw.slice(0, remaining).map(c => ({
      ...customToReviewCard(c, null), reviewMode: "forward" as const,
    }));
    const remainingAfterCustom = Math.max(0, remaining - newCustomCards.length);
    const newContentCards = getNewItems(unlockedUnits, seenIds, remainingAfterCustom).map(c => ({
      ...c, reviewMode: "forward" as const,
    }));

    cards = [...taggedDue, ...newCustomCards, ...newContentCards];
  }

  // Attach cached translations (skip custom cards that already have english)
  const idsNeedingTranslation = cards.filter(c => !c.translation).map(c => c.itemId);
  const translationMap = await getCachedTranslations(idsNeedingTranslation);
  const cardsWithTranslations = cards.map((c) => ({
    ...c,
    translation: c.translation ?? translationMap[c.itemId] ?? undefined,
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
