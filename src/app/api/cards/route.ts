import { NextResponse } from "next/server";
import { getAllCardStates, getCustomCardsByIds, getCachedTranslations } from "@/lib/db";
import { getItemsByIds } from "@/lib/content";
import type { StudiedCard } from "@/types";

export async function GET() {
  const allStates = await getAllCardStates();
  if (!allStates.length) return NextResponse.json({ cards: [] });

  const today = new Date().toISOString().split("T")[0];

  const customIds = allStates.filter((s) => s.itemId.startsWith("custom-")).map((s) => s.itemId);
  const contentIds = allStates.filter((s) => !s.itemId.startsWith("custom-")).map((s) => s.itemId);

  const [customRaw, contentItems, translations] = await Promise.all([
    getCustomCardsByIds(customIds),
    Promise.resolve(getItemsByIds(contentIds)),
    getCachedTranslations(contentIds),
  ]);

  const stateMap = Object.fromEntries(allStates.map((s) => [s.itemId, s]));

  function makeCard(
    itemId: string,
    dutch: string,
    english: string | null,
    unitId: string,
    unitName: string,
    isCustom: boolean
  ): StudiedCard {
    const s = stateMap[itemId];
    return {
      itemId,
      dutch,
      english,
      unitId,
      unitName,
      isCustom,
      interval: s.interval,
      repetitions: s.repetitions,
      nextReview: s.nextReview,
      totalReviews: s.totalReviews,
      correctReviews: s.correctReviews,
      isDue: s.nextReview <= today,
      forgetRate:
        s.totalReviews > 0
          ? (s.totalReviews - s.correctReviews) / s.totalReviews
          : 0,
    };
  }

  const cards: StudiedCard[] = [
    ...customRaw.map((c) =>
      makeCard(c.id, c.dutch, c.english, "custom", "My Vocabulary", true)
    ),
    ...contentItems.map((item) =>
      makeCard(
        item.itemId,
        item.sentences[0] ?? "",
        translations[item.itemId] ?? null,
        item.unitId,
        item.unitName,
        false
      )
    ),
  ];

  return NextResponse.json({ cards });
}
