import type { UnitsData, Unit, Item, ReviewCard } from "@/types";
import unitsData from "../../content/units.json";

const data = unitsData as UnitsData;

export function getAllUnits(): Unit[] {
  return data.units;
}

export function getUnit(unitNum: number): Unit | undefined {
  return data.units.find((u) => u.unit === unitNum);
}

// Flatten all items for a given set of unlocked unit numbers
export function getItemsForUnits(unitNums: number[]): ReviewCard[] {
  const cards: ReviewCard[] = [];
  for (const unit of data.units) {
    if (!unitNums.includes(unit.unit)) continue;
    for (const lesson of unit.lessons) {
      for (const item of lesson.items) {
        cards.push({
          itemId: item.id,
          unitId: unit.id,
          unitName: unit.name,
          lessonId: lesson.id,
          lessonType: lesson.type,
          sentences: item.sentences,
          audioFolder: unit.folder,
          lessonAudio: lesson.audio,
          state: null,
        });
      }
    }
  }
  return cards;
}

export function getItemById(itemId: string): ReviewCard | undefined {
  for (const unit of data.units) {
    for (const lesson of unit.lessons) {
      const item = lesson.items.find((i) => i.id === itemId);
      if (item) {
        return {
          itemId: item.id,
          unitId: unit.id,
          unitName: unit.name,
          lessonId: lesson.id,
          lessonType: lesson.type,
          sentences: item.sentences,
          audioFolder: unit.folder,
          lessonAudio: lesson.audio,
          state: null,
        };
      }
    }
  }
  return undefined;
}

export function getItemsByIds(itemIds: string[]): ReviewCard[] {
  const set = new Set(itemIds);
  const result: ReviewCard[] = [];
  for (const unit of data.units) {
    for (const lesson of unit.lessons) {
      for (const item of lesson.items) {
        if (set.has(item.id)) {
          result.push({
            itemId: item.id,
            unitId: unit.id,
            unitName: unit.name,
            lessonId: lesson.id,
            lessonType: lesson.type,
            sentences: item.sentences,
            audioFolder: unit.folder,
            lessonAudio: lesson.audio,
            state: null,
          });
        }
      }
    }
  }
  return result;
}

// Pick N random unseen items from unlocked units (for new-card sessions)
export function getNewItems(
  unitNums: number[],
  seenIds: Set<string>,
  count: number
): ReviewCard[] {
  const all = getItemsForUnits(unitNums).filter((c) => !seenIds.has(c.itemId));
  // Shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, count);
}

// Choose a word to blank out for fill-in-blank mode
export function pickBlankWord(sentence: string): { blanked: string; answer: string } | null {
  // Prefer content words (nouns, verbs) — skip short function words
  const SKIP = new Set(["de", "het", "een", "en", "in", "op", "is", "zijn", "hij", "zij", "ik", "u"]);
  const words = sentence.split(/\s+/);
  const candidates = words
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.length > 3 && !SKIP.has(w.toLowerCase().replace(/[^a-z]/gi, "")));

  if (!candidates.length) return null;

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const blanked = words
    .map((w, i) => (i === pick.i ? "_".repeat(w.length) : w))
    .join(" ");

  return { blanked, answer: pick.w };
}
