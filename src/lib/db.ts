import { createClient, type Client } from "@libsql/client";
import type { CardState, Rating } from "@/types";

let _client: Client | null = null;
let _schemaPromise: Promise<void> | null = null;

function getClient(): Client {
  if (_client) return _client;
  _client = createClient({
    url: process.env.TURSO_DATABASE_URL ?? `file:${process.cwd()}/data/reviews.db`,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return _client;
}

export interface CustomCard {
  id: string;
  dutch: string;
  english: string | null;
  createdAt: string;
}

async function ensureSchema(client: Client): Promise<void> {
  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS custom_cards (
        id         TEXT PRIMARY KEY,
        dutch      TEXT NOT NULL,
        english    TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS translations (
        item_id     TEXT PRIMARY KEY,
        translation TEXT NOT NULL,
        fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS card_states (
        item_id         TEXT PRIMARY KEY,
        ease_factor     REAL    NOT NULL DEFAULT 2.5,
        interval        INTEGER NOT NULL DEFAULT 0,
        repetitions     INTEGER NOT NULL DEFAULT 0,
        next_review     TEXT    NOT NULL DEFAULT (date('now')),
        total_reviews   INTEGER NOT NULL DEFAULT 0,
        correct_reviews INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS review_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id         TEXT    NOT NULL,
        rating          TEXT    NOT NULL,
        response_ms     INTEGER NOT NULL,
        reviewed_at     TEXT    NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    "write"
  );
}

async function getDb(): Promise<Client> {
  const client = getClient();
  if (!_schemaPromise) _schemaPromise = ensureSchema(client);
  await _schemaPromise;
  return client;
}

// ── SM-2 algorithm ────────────────────────────────────────────────────────────

function sm2(
  ef: number,
  interval: number,
  reps: number,
  rating: Rating
): { ef: number; interval: number; reps: number } {
  const q = rating === "easy" ? 5 : rating === "hard" ? 3 : 1;
  if (q < 3) return { ef, interval: 1, reps: 0 };
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

function rowToCardState(row: Record<string, unknown>): CardState {
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

// ── Public API ────────────────────────────────────────────────────────────────

export async function getCardState(itemId: string): Promise<CardState | null> {
  const db = await getDb();
  const res = await db.execute({ sql: "SELECT * FROM card_states WHERE item_id = ?", args: [itemId] });
  if (!res.rows.length) return null;
  return rowToCardState(res.rows[0] as unknown as Record<string, unknown>);
}

export async function recordReview(
  itemId: string,
  rating: Rating,
  responseMs: number
): Promise<CardState> {
  const db = await getDb();
  const existing = await getCardState(itemId);

  const ef = existing?.easeFactor ?? 2.5;
  const interval = existing?.interval ?? 0;
  const reps = existing?.repetitions ?? 0;
  const totalReviews = (existing?.totalReviews ?? 0) + 1;
  const correctReviews = (existing?.correctReviews ?? 0) + (rating !== "forgot" ? 1 : 0);

  const next = sm2(ef, interval, reps, rating);
  const nextReview = addDays(next.interval);

  await db.batch([
    {
      sql: `INSERT INTO card_states (item_id, ease_factor, interval, repetitions, next_review, total_reviews, correct_reviews)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(item_id) DO UPDATE SET
              ease_factor = excluded.ease_factor,
              interval = excluded.interval,
              repetitions = excluded.repetitions,
              next_review = excluded.next_review,
              total_reviews = excluded.total_reviews,
              correct_reviews = excluded.correct_reviews`,
      args: [itemId, next.ef, next.interval, next.reps, nextReview, totalReviews, correctReviews],
    },
    {
      sql: "INSERT INTO review_log (item_id, rating, response_ms) VALUES (?, ?, ?)",
      args: [itemId, rating, responseMs],
    },
  ], "write");

  return { itemId, easeFactor: next.ef, interval: next.interval, repetitions: next.reps, nextReview, totalReviews, correctReviews };
}

export async function getDueItems(unlockedUnits: number[], limit = 30): Promise<string[]> {
  const db = await getDb();
  const today = new Date().toISOString().split("T")[0];
  const res = await db.execute({
    sql: `SELECT item_id FROM card_states WHERE next_review <= ? ORDER BY next_review ASC LIMIT ?`,
    args: [today, limit],
  });
  return res.rows.map((r) => r.item_id as string);
}

export async function getAllCardStates(): Promise<CardState[]> {
  const db = await getDb();
  const res = await db.execute("SELECT * FROM card_states");
  return res.rows.map((r) => rowToCardState(r as unknown as Record<string, unknown>));
}

export async function getCachedTranslations(itemIds: string[]): Promise<Record<string, string>> {
  if (!itemIds.length) return {};
  const db = await getDb();
  const placeholders = itemIds.map(() => "?").join(",");
  const res = await db.execute({
    sql: `SELECT item_id, translation FROM translations WHERE item_id IN (${placeholders})`,
    args: itemIds,
  });
  return Object.fromEntries(res.rows.map((r) => [r.item_id as string, r.translation as string]));
}

export async function setCachedTranslation(itemId: string, translation: string): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: "INSERT OR REPLACE INTO translations (item_id, translation) VALUES (?, ?)",
    args: [itemId, translation],
  });
}

export async function getLearnedItemIds(eligibleIds: string[]): Promise<string[]> {
  if (!eligibleIds.length) return [];
  const db = await getDb();
  const res = await db.execute("SELECT item_id FROM card_states WHERE repetitions >= 1");
  const eligible = new Set(eligibleIds);
  return res.rows.map((r) => r.item_id as string).filter((id) => eligible.has(id));
}

export async function getWeakItems(limit = 20): Promise<{ itemId: string; forgetRate: number }[]> {
  const db = await getDb();
  const res = await db.execute({
    sql: `SELECT item_id,
                 CAST(total_reviews - correct_reviews AS REAL) / total_reviews AS forget_rate
          FROM card_states
          WHERE total_reviews >= 3
          ORDER BY forget_rate DESC
          LIMIT ?`,
    args: [limit],
  });
  return res.rows.map((r) => ({ itemId: r.item_id as string, forgetRate: r.forget_rate as number }));
}

export async function getReviewStreak(): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `SELECT DISTINCT date(reviewed_at) as day FROM review_log ORDER BY day DESC`
  );
  if (!res.rows.length) return 0;
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < res.rows.length; i++) {
    const expected = new Date(today);
    expected.setDate(today.getDate() - i);
    if ((res.rows[i].day as string) === expected.toISOString().split("T")[0]) streak++;
    else break;
  }
  return streak;
}

export async function getReviewCalendar(days = 60): Promise<Record<string, number>> {
  const db = await getDb();
  const res = await db.execute({
    sql: `SELECT date(reviewed_at) as day, COUNT(*) as count
          FROM review_log
          WHERE reviewed_at >= date('now', ?)
          GROUP BY day`,
    args: [`-${days} days`],
  });
  return Object.fromEntries(res.rows.map((r) => [r.day as string, r.count as number]));
}

// ── Custom cards ──────────────────────────────────────────────────────────────

export async function createCustomCard(dutch: string, english?: string): Promise<string> {
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const db = await getDb();
  await db.execute({
    sql: "INSERT INTO custom_cards (id, dutch, english) VALUES (?, ?, ?)",
    args: [id, dutch.trim(), english?.trim() ?? null],
  });
  return id;
}

export async function getCustomCards(): Promise<CustomCard[]> {
  const db = await getDb();
  const res = await db.execute("SELECT * FROM custom_cards ORDER BY created_at DESC");
  return res.rows.map((r) => ({
    id: r.id as string,
    dutch: r.dutch as string,
    english: r.english as string | null,
    createdAt: r.created_at as string,
  }));
}

export async function getCustomCardsByIds(ids: string[]): Promise<CustomCard[]> {
  if (!ids.length) return [];
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  const res = await db.execute({
    sql: `SELECT * FROM custom_cards WHERE id IN (${placeholders})`,
    args: ids,
  });
  return res.rows.map((r) => ({
    id: r.id as string,
    dutch: r.dutch as string,
    english: r.english as string | null,
    createdAt: r.created_at as string,
  }));
}

export async function getNewCustomCards(seenIds: Set<string>): Promise<CustomCard[]> {
  const db = await getDb();
  const res = await db.execute("SELECT * FROM custom_cards ORDER BY created_at ASC");
  return res.rows
    .filter((r) => !seenIds.has(r.id as string))
    .map((r) => ({
      id: r.id as string,
      dutch: r.dutch as string,
      english: r.english as string | null,
      createdAt: r.created_at as string,
    }));
}

export async function deleteCustomCard(id: string): Promise<void> {
  const db = await getDb();
  await db.batch(
    [
      { sql: "DELETE FROM custom_cards WHERE id = ?", args: [id] },
      { sql: "DELETE FROM card_states WHERE item_id = ?", args: [id] },
      { sql: "DELETE FROM review_log WHERE item_id = ?", args: [id] },
      { sql: "DELETE FROM translations WHERE item_id = ?", args: [id] },
    ],
    "write"
  );
}
