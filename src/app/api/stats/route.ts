import { NextResponse } from "next/server";
import { getWeakItems, getReviewStreak, getReviewCalendar, getAllCardStates } from "@/lib/db";
import { getItemsByIds } from "@/lib/content";

export async function GET() {
  const streak = getReviewStreak();
  const calendar = getReviewCalendar(60);
  const weakRaw = getWeakItems(20);

  const weakCards = getItemsByIds(weakRaw.map((w) => w.itemId));
  const weakItems = weakRaw.map((w) => {
    const card = weakCards.find((c) => c.itemId === w.itemId);
    return {
      itemId: w.itemId,
      forgetRate: w.forgetRate,
      sentences: card?.sentences ?? [],
      unitName: card?.unitName ?? "",
      lessonId: card?.lessonId ?? "",
    };
  });

  const allStates = getAllCardStates();
  const today = new Date().toISOString().split("T")[0];
  const dueCount = allStates.filter((s) => s.nextReview <= today).length;
  const totalSeen = allStates.length;

  return NextResponse.json({ streak, calendar, weakItems, dueCount, totalSeen });
}
