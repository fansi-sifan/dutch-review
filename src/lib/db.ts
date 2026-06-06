import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { CardState, Rating } from "@/types";

const DB_PATH = path.join(process.cwd(), "data", "reviews.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS card_states (
      item_id         TEXT PRIMARY KEY,
      ease_factor     REAL    NOT NULL DEFAULT 2.5,
      interval        INTEGER NOT NULL DEFAULT 0,
      repetitions     INTEGER NOT NULL DEFAULT 0,
      next_review     TEXT    NOT NULL DEFAULT (date('now')),
      total_reviews   INTEGER NOT NULL DEFAULT 0,
      correct_reviews INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS review_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id         TEXT    NOT NULL,
      rating          TEXT    NOT NULL,
      response_ms     INTEGER NOT NULL,
      reviewed_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return _db;
}

// SM-2 algorithm
function sm2(
  ef: number,
  interval: number,
  reps: number,
  rating: Rating
): { ef: number; interval: number; reps: number } {
  // Map rating → quality score (0-5)
  const q = rating === "easy" ? 5 : rating === "hard" ? 3 : 1;

  if (q < 3) {
    return { ef, interval: 1, reps: 0 };
  }

  const newEf = Math.max(1.3, ef + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  let newInterval: number;

  if (reps === 0) newInterval = 1;
  else if (reps === 1) newInterval = 4;
  else newInterval = Math.round(interval * newEf);

  return { ef: newEf, interval: newInterval, reps: reps + 1 };
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function getCardState(itemId: string): CardState | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM card_states WHERE item_id = ?")
    .get(itemId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    itemId: row.item_id as string,
    easeFactor: row.ease_factor as number,
    interval: row.interval as number,
    repetitions: row.repetitions as number,
    nextReview: row.next_review as string,
    totalReviews: row.total_reviews as number,
    correctReviews: row.correct_reviews as number,
  };
}

export function recordReview(
  itemId: string,
  rating: Rating,
  responseMs: number
): CardState {
  const db = getDb();
  const existing = getCardState(itemId);

  const ef = existing?.easeFactor ?? 2.5;
  const interval = existing?.interval ?? 0;
  const reps = existing?.repetitions ?? 0;
  const totalReviews = (existing?.totalReviews ?? 0) + 1;
  const correctReviews =
    (existing?.correctReviews ?? 0) + (rating !== "forgot" ? 1 : 0);

  const next = sm2(ef, interval, reps, rating);
  const nextReview = addDays(next.interval);

  db.prepare(`
    INSERT INTO card_states (item_id, ease_factor, interval, repetitions, next_review, total_reviews, correct_reviews)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      ease_factor = excluded.ease_factor,
      interval = excluded.interval,
      repetitions = excluded.repetitions,
      next_review = excluded.next_review,
      total_reviews = excluded.total_reviews,
      correct_reviews = excluded.correct_reviews
  `).run(itemId, next.ef, next.interval, next.reps, nextReview, totalReviews, correctReviews);

  db.prepare(
    "INSERT INTO review_log (item_id, rating, response_ms) VALUES (?, ?, ?)"
  ).run(itemId, rating, responseMs);

  return {
    itemId,
    easeFactor: next.ef,
    interval: next.interval,
    repetitions: next.reps,
    nextReview,
    totalReviews,
    correctReviews,
  };
}

export function getDueItems(unlockedUnits: number[], limit = 30): string[] {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];

  // Items with a card state that are due
  const due = db
    .prepare(
      `SELECT item_id FROM card_states
       WHERE next_review <= ?
       ORDER BY next_review ASC
       LIMIT ?`
    )
    .all(today, limit) as { item_id: string }[];

  return due.map((r) => r.item_id);
}

export function getLearnedItemIds(eligibleIds: string[]): string[] {
  if (!eligibleIds.length) return [];
  const db = getDb();
  const rows = db
    .prepare("SELECT item_id FROM card_states WHERE repetitions >= 1")
    .all() as { item_id: string }[];
  const eligible = new Set(eligibleIds);
  return rows.filter((r) => eligible.has(r.item_id)).map((r) => r.item_id);
}

export function getAllCardStates(): CardState[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM card_states")
    .all() as Record<string, unknown>[];
  return rows.map((row) => ({
    itemId: row.item_id as string,
    easeFactor: row.ease_factor as number,
    interval: row.interval as number,
    repetitions: row.repetitions as number,
    nextReview: row.next_review as string,
    totalReviews: row.total_reviews as number,
    correctReviews: row.correct_reviews as number,
  }));
}

export function getWeakItems(limit = 20): { itemId: string; forgetRate: number }[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT item_id,
              total_reviews,
              correct_reviews,
              CAST(total_reviews - correct_reviews AS REAL) / total_reviews AS forget_rate
       FROM card_states
       WHERE total_reviews >= 3
       ORDER BY forget_rate DESC
       LIMIT ?`
    )
    .all(limit) as { item_id: string; forget_rate: number }[];
  return rows.map((r) => ({ itemId: r.item_id, forgetRate: r.forget_rate }));
}

export function getReviewStreak(): number {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT date(reviewed_at) as day
       FROM review_log
       ORDER BY day DESC`
    )
    .all() as { day: string }[];

  if (!rows.length) return 0;

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < rows.length; i++) {
    const expected = new Date(today);
    expected.setDate(today.getDate() - i);
    const expectedStr = expected.toISOString().split("T")[0];
    if (rows[i].day === expectedStr) streak++;
    else break;
  }
  return streak;
}

export function getReviewCalendar(days = 60): Record<string, number> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT date(reviewed_at) as day, COUNT(*) as count
       FROM review_log
       WHERE reviewed_at >= date('now', ?)
       GROUP BY day`
    )
    .all(`-${days} days`) as { day: string; count: number }[];
  return Object.fromEntries(rows.map((r) => [r.day, r.count]));
}
