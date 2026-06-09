import { NextRequest, NextResponse } from "next/server";
import { getAllCardStates } from "@/lib/db";
import { getItemsForUnits } from "@/lib/content";

// GET /api/counts?units=1,2,3,4,5,6
export async function GET(req: NextRequest) {
  const unitsParam = req.nextUrl.searchParams.get("units") ?? "1,2,3,4,5,6";
  const unlockedUnits = unitsParam.split(",").map(Number).filter(Boolean);

  const [allStates, contentItems] = await Promise.all([
    getAllCardStates(),
    Promise.resolve(getItemsForUnits(unlockedUnits)),
  ]);

  const learnedCount = allStates.filter((s) => s.repetitions >= 1).length;

  return NextResponse.json({
    studied: allStates.length,
    learned: learnedCount,
    total: contentItems.length,
  });
}
