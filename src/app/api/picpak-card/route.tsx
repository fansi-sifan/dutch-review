import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";
import { getWeakItems, getCachedTranslations } from "@/lib/db";
import { getItemsByIds, pickKeyWordIndex } from "@/lib/content";

// Node runtime (the default): @libsql/client is not edge-safe, and next/og
// renders fine here. Never cache — the Pi fetches this expecting today's card.
export const dynamic = "force-dynamic";

const WIDTH = 400;
const HEIGHT = 300;
const POOL_SIZE = 10;

// The panel has exactly four inks. Anything else gets dithered into speckle, so
// every colour below must be one of these nominal values verbatim — the encoder
// matches against measured ink appearance and only these land flat.
// (Note: the spec's suggested #d00000 is NOT a palette colour and would dither.)
const INK_BLACK = "#000000";
const INK_WHITE = "#ffffff";
const INK_YELLOW = "#ffff00"; // measured (235,195,26) — only legible *behind* black
// INK_RED = "#ff0000" — measured (166,49,34), a muted brick. Deliberately unused:
// it is the lowest-contrast ink and the card's smallest text is its worst home.

/**
 * Constant-time string compare via double-HMAC under an ephemeral key, so it
 * leaks neither content nor length. Mirrors the crypto.subtle approach already
 * used in src/middleware.ts.
 */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const [da, db] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(a)),
    crypto.subtle.sign("HMAC", key, enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/**
 * How often the chosen card advances. MUST match the bridge's
 * PICPAK_MIN_INTERVAL_HOURS (~/.picpak-bridge.env on the Pi): if the rotation
 * period is longer than the push interval, a push re-renders the identical
 * image and spends a full panel repaint — the most battery-expensive thing the
 * device does — to change nothing.
 */
const ROTATE_HOURS = 12;

/** Rotation counter — deterministic, so the same card renders all period. */
function periodIndex(): number {
  return Math.floor(Date.now() / (ROTATE_HOURS * 3_600_000));
}

/**
 * Shortest sentence wins on legibility: items carry up to 8 sentences running to
 * 188 chars, and on a 400x300 panel read from across the kitchen only a short
 * one renders large enough to glance at.
 *
 * But the translations table is keyed by itemId alone — one gloss per item, and
 * it belongs to sentences[0]. Pairing it with any other sentence prints a
 * confidently wrong translation. So: when a gloss exists, show the sentence it
 * actually describes; otherwise take the shortest and show no English at all.
 */
function pickSentence(sentences: string[], hasTranslation: boolean): string {
  if (!sentences.length) return "";
  if (hasTranslation) return sentences[0];
  return sentences.reduce((best, s) => (s.length < best.length ? s : best), sentences[0]);
}

/** Type scale chosen against real sentence lengths (p50 26, p90 47, max 188). */
function fontSizeFor(text: string): number {
  const n = text.length;
  if (n <= 18) return 46;
  if (n <= 30) return 38;
  if (n <= 46) return 30;
  if (n <= 68) return 24;
  return 19;
}

/**
 * @param index which card of the weak pool to render. Omitted, the card rotates
 *   on ROTATE_HOURS -- the single-card mode, where the Pi pushes one image and
 *   the choice is made here. Supplied, the caller is loading a whole deck onto
 *   the device and driving the index itself; rotation then belongs to the
 *   panel's own refresh_interval, not to us.
 */
async function selectCard(index?: number) {
  const weak = await getWeakItems(POOL_SIZE * 3);
  if (!weak.length) return null;

  // getItemsByIds drops non-reviewable vocab-list items, so re-rank the
  // survivors by the original forget_rate order rather than trusting its order.
  const cards = getItemsByIds(weak.map((w) => w.itemId));
  const byId = new Map(cards.map((c) => [c.itemId, c]));
  const pool = weak
    .filter((w) => byId.has(w.itemId))
    .slice(0, POOL_SIZE);
  if (!pool.length) return null;

  // An out-of-range index means the deck on the device is longer than the pool
  // is now -- the caller needs to erase that tail, not wrap around to a card it
  // already has.
  if (index !== undefined && (index < 0 || index >= pool.length)) return null;

  const chosen = index !== undefined ? pool[index] : pool[periodIndex() % pool.length];
  const card = byId.get(chosen.itemId)!;

  const translations = await getCachedTranslations([card.itemId]);
  const english = translations[card.itemId] ?? null;
  const dutch = pickSentence(card.sentences, english !== null);

  return {
    itemId: card.itemId,
    dutch,
    english,
    forgetRate: chosen.forgetRate,
    unitName: card.unitName,
    lessonId: card.lessonId,
    poolSize: pool.length,
  };
}

export async function GET(request: NextRequest) {
  const expected = process.env.PICPAK_TOKEN;
  const supplied = request.nextUrl.searchParams.get("token");

  // 404 rather than 401: an unauthenticated caller learns nothing about whether
  // this route exists. An unset PICPAK_TOKEN fails closed.
  if (!expected || !supplied || !(await safeEqual(supplied, expected))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const rawIndex = request.nextUrl.searchParams.get("index");
  let index: number | undefined;
  if (rawIndex !== null) {
    index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0) {
      return new NextResponse("Bad index", { status: 400 });
    }
  }

  const card = await selectCard(index);

  if (request.nextUrl.searchParams.get("debug") === "1") {
    return NextResponse.json(
      {
        card,
        periodIndex: periodIndex(),
        rotateHours: ROTATE_HOURS,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "cache-control": "no-store" } }
    );
  }

  // Deck mode asked for a card past the end of the pool. 404 tells the bridge
  // where the deck stops, so it can erase the slots beyond it -- cards that
  // have since stopped being weak. Rendering "Geen kaarten" here instead would
  // silently pad the device with blanks.
  if (index !== undefined && !card) {
    return new NextResponse("No card at index", { status: 404 });
  }

  // Stamp so a stale panel is obvious at a glance: if the date on the fridge
  // isn't today's, the last refresh silently failed.
  const stamp = new Date().toISOString().slice(5, 10).replace("-", "/");
  const dutch = card?.dutch ?? "Geen kaarten";
  const english = card?.english ?? null;
  const footer = card ? `${stamp}  ${card.itemId}` : stamp;
  const keyWord = card ? pickKeyWordIndex(dutch) : -1;

  return new ImageResponse(
    (
      // Pure #000 on #fff only. Any grey, opacity, or thin anti-aliased stroke
      // gets dithered into visible speckle by the four-colour panel.
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: INK_WHITE,
          color: INK_BLACK,
          padding: 20,
        }}
      >
        {/*
          No fontWeight here: next/og's bundled fallback font ships regular only,
          so fontWeight:700 renders byte-identical to 400 (verified). Hierarchy
          comes from size instead. To get real bold, commit a bold .ttf and pass
          it via the `fonts` option — pure #000 needs no weight to avoid dither.

          Rendered word-by-word so one word can sit on a yellow block. Black on
          yellow is the highest-contrast pairing the panel can produce.
        */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            fontSize: fontSizeFor(dutch),
            lineHeight: 1.25,
          }}
        >
          {dutch.split(/\s+/).map((word, i) => (
            <span
              key={i}
              style={{
                display: "flex",
                padding: "0 5px",
                ...(i === keyWord ? { background: INK_YELLOW } : {}),
              }}
            >
              {word}
            </span>
          ))}
        </div>

        {english ? (
          <div
            style={{
              display: "flex",
              fontSize: 20,
              marginTop: 14,
              textAlign: "center",
              lineHeight: 1.25,
            }}
          >
            {english}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: 8,
            right: 10,
            fontSize: 11,
          }}
        >
          {footer}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: { "cache-control": "no-store" },
    }
  );
}
