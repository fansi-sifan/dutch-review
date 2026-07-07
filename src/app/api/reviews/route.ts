import { NextRequest, NextResponse } from "next/server";
import {
  recordReview,
  getDueItems,
  getAllCardStates,
  getLastEasyItemIds,
  getEasyInModeItemIds,
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

    // Audio drill: cards whose last review was "easy" (same as before)
    // Reverse drill: cards that have been rated easy in audio mode at least once
    const eligibleIds = mode === "audio"
      ? await getLastEasyItemIds(allEligibleIds)
      : await getEasyInModeItemIds(allEligibleIds, "audio");

    if (!eligibleIds.length) return NextResponse.json({ cards: [], total: 0 });

    const customIds = eligibleIds.filter((id) => id.startsWith("custom-"));
    const contentIds = eligibleIds.filter((id) => !id.startsWith("custom-"));

    const contentCards = getItemsByIds(contentIds);
    const customRaw = await getCustomCardsByIds(customIds);
    const customCards = customRaw.map(c => customToReviewCard(c, stateMap[c.id] ?? null));

    const reviewMode = mode === "audio" ? "audio" as const : "reverse" as const;
    const combined = [
      ...contentCards.map(c => ({ ...c, state: stateMap[c.itemId] ?? null, reviewMode })),
      ...customCards.map(c => ({ ...c, reviewMode })),
    ];
    shuffle(combined);
    cards = combined;
  } else {
    // Blended session: 12 due (mixed forward/audio/reverse) + 8 new
    const newCardSlots = 8;
    const maxDue = sessionSize - newCardSlots;   // 12
    const audioSlots = 4;
    const reverseSlots = 4;

    const allDueIds = await getDueItems(unlockedUnits, maxDue);
    const customDueIds = allDueIds.filter((id) => id.startsWith("custom-"));
    const contentDueIds = allDueIds.filter((id) => !id.startsWith("custom-"));

    const contentDueCards = getItemsByIds(contentDueIds).map(c => ({ ...c, state: stateMap[c.itemId] ?? null }));
    const customDueRaw = await getCustomCardsByIds(customDueIds);
    const customDueCards = customDueRaw.map(c => customToReviewCard(c, stateMap[c.id] ?? null));

    const dueCards = [...contentDueCards, ...customDueCards];
    const dueIds = dueCards.map((c) => c.itemId);

    // Audio-eligible: last review was "easy" (learned in forward)
    // Reverse-eligible: ever rated "easy" in audio mode
    const [audioEligibleIds, reverseEligibleIds] = await Promise.all([
      getLastEasyItemIds(dueIds),
      getEasyInModeItemIds(dueIds, "audio"),
    ]);

    // Pick reverse cards first (highest tier), then audio, rest stay forward
    const reverseSet = new Set(
      reverseEligibleIds
        .sort(() => Math.random() - 0.5)
        .slice(0, reverseSlots)
    );
    const audioEligibleNotReverse = audioEligibleIds.filter((id) => !reverseSet.has(id));
    const audioSet = new Set(
      audioEligibleNotReverse
        .sort(() => Math.random() - 0.5)
        .slice(0, audioSlots)
    );

    const taggedDue = dueCards.map((c) => ({
      ...c,
      reviewMode: reverseSet.has(c.itemId)
        ? "reverse" as const
        : audioSet.has(c.itemId)
        ? "audio" as const
        : "forward" as const,
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

// POST /api/reviews  body: ReviewResult[]
export async function POST(req: NextRequest) {
  const results: ReviewResult[] = await req.json();
  const updated = await Promise.all(
    results.map((r) => recordReview(r.itemId, r.rating, r.responseTimeMs, r.mode ?? "forward"))
  );
  return NextResponse.json({ updated });
}
