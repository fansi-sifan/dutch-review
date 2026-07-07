export interface Item {
  id: string;
  number: number;
  sentences: string[];
}

export interface Lesson {
  id: string;
  type: "Hoofdles" | "Mijlpaal";
  sublesson: number;
  audio: Record<string, string>;
  items: Item[];
}

export interface Unit {
  id: string;
  unit: number;
  level: number;
  name: string;
  folder: string;
  lessons: Lesson[];
}

export interface UnitsData {
  units: Unit[];
}

// SRS card state stored in SQLite
export interface CardState {
  itemId: string;
  easeFactor: number;   // SM-2 ease factor, starts at 2.5
  interval: number;     // days until next review
  repetitions: number;  // consecutive correct answers
  nextReview: string;   // ISO date string
  totalReviews: number;
  correctReviews: number;
}

export type Rating = "forgot" | "hard" | "easy";

// A review result sent from the client
export interface ReviewResult {
  itemId: string;
  rating: Rating;
  responseTimeMs: number;
}

// A card ready for review, with its content
export interface ReviewCard {
  itemId: string;
  unitId: string;
  unitName: string;
  lessonId: string;
  lessonType: string;
  sentences: string[];
  audioFolder: string;
  lessonAudio: Record<string, string>;
  state: CardState | null;          // null = never reviewed before
  translation?: string;             // pre-fetched from DB cache, if available
  reviewMode?: "forward" | "reverse" | "audio"; // per-card override; undefined = use session default
}

export type ReviewMode = "flashcard";

// A card that has been reviewed at least once, enriched for the Cards tab
export interface StudiedCard {
  itemId: string;
  dutch: string;
  english: string | null;
  unitId: string;
  unitName: string;
  isCustom: boolean;
  interval: number;
  repetitions: number;
  nextReview: string;
  totalReviews: number;
  correctReviews: number;
  isDue: boolean;
  forgetRate: number;   // 0–1; (totalReviews - correctReviews) / totalReviews
}
