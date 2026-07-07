import { NextRequest, NextResponse } from "next/server";
import { getAllCardStates, getLastEasyItemIds, getEasyInModeItemIds } from "@/lib/db";
import { getItemsForUnits } from "@/lib/content";

// GET /api/counts?units=1,2,3,4,5,6
export async function GET(req: NextRequest) {
  const unitsParam = req.nextUrl.searchParams.get("units") ?? "1,2,3,4,5,6";
  const unlockedUnits = unitsParam.split(",").map(Number).filter(Boolean);

  const [allStates, contentItems] = await Promise.all([
    getAllCardStates(),
    Promise.resolve(getItemsForUnits(unlockedUnits)),
  ]);

  const allIds = allStates.map((s) => s.itemId);
  // Audio-ready = last review was "easy"
  // Reverse-ready = ever rated "easy" in audio mode
  const [audioReadyIds, reverseReadyIds] = await Promise.all([
    getLastEasyItemIds(allIds),
    getEasyInModeItemIds(allIds, "audio"),
  ]);

  return NextResponse.json({
    studied: allStates.length,
    audioReady: audioReadyIds.length,
    reverseReady: reverseReadyIds.length,
    total: contentItems.length,
  });
}
