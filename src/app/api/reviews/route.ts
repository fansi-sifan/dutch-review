import { NextRequest, NextResponse } from "next/server";
import {
  recordReview,
  getDueItems,
  getAllCardStates,
  getLastEasyItemIds,
  getCachedTranslations,
  getCustomCardsByIds,
  getNewCustomCards,
  type CustomCard,
} from "@/lib/db";
import { getItemsByIds, getNewItems, getItemsForUnits } from "@/lib/content";
import type { ReviewCard, ReviewResult } from "@/types";

/** Fisher-Yates in-place shuffle */
function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

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

  if (mode === "audio" || mode === "reverse") {
    const allItems = getItemsForUnits(unlockedUnits);
    const allEligibleIds = [...allItems.map((i) => i.itemId), ...Array.from(seenIds).filter(id => id.startsWith("custom-"))];
    // Only show cards whose most recent review was "easy" — not ones still marked hard/forgot
    const learnedIds = await getLastEasyItemIds(allEligibleIds);

    const customLearnedIds = learnedIds.filter((id) => id.startsWith("custom-"));
    const contentLearnedIds = learnedIds.filter((id) => !id.startsWith("custom-"));

    if (!learnedIds.length) return NextResponse.json({ cards: [], total: 0 });

    // Return ALL learned cards. getItemsByIds returns in content order regardless of
    // input order, so we shuffle the final assembled array (not just the IDs).
    const contentCards = getItemsByIds(contentLearnedIds);
    const customRaw = await getCustomCardsByIds(customLearnedIds);
    const customCards = customRaw.map(c => customToReviewCard(c, stateMap[c.id] ?? null));

    const reviewMode = mode === "audio" ? "audio" as const : "reverse" as const;
    const combined = [
      ...contentCards.map(c => ({ ...c, state: stateMap[c.itemId] ?? null, reviewMode })),
      ...customCards.map(c => ({ ...c, reviewMode })),
    ];
    shuffle(combined);
    cards = combined;
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

    // Cards seen at least twice (total, not streak) are fair game for reverse.
    // Using totalReviews instead of repetitions because repetitions resets on
    // "forgot", meaning frequently-forgotten cards would never qualify otherwise.
    const eligibleForReverse = dueCards.filter(
      (c) => (stateMap[c.itemId]?.totalReviews ?? 0) >= 2
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

    const allCards = [...taggedDue, ...newCustomCards, ...newContentCards];
    shuffle(allCards);
    cards = allCards;
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
