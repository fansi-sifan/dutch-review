# 🇳🇱 Dutch Review

A personal spaced-repetition flashcard app for learning Dutch alongside Rosetta Stone. Built with Next.js, deployed on Vercel, with a Turso (libSQL) cloud database.

## Features

- **SM-2 spaced repetition** — cards scheduled based on recall quality (forgot → tomorrow, hard → 1 day, easy → grows exponentially)
- **Infinite review sessions** — keep going as long as you like; exit anytime to save progress
- **Blended forward + reverse** — due cards mix NL→EN recognition with EN→NL production for cards you've already mastered
- **10 due + 10 new per batch** — always sees new vocabulary alongside reviews; deduped within a session
- **Custom vocabulary cards** — add your own Dutch sentences from real life; they join the spaced repetition queue
- **Translation caching** — English translations fetched from MyMemory API and cached in the DB
- **Stats & weak spots** — review streak, activity calendar, and cards you've forgotten most often
- **Cards browser** — filterable/sortable list of all studied cards (Due, Struggling, Strong, My Cards)
- **Password protection** — HMAC-signed 1-year session cookie; enter once per browser
- **PWA-ready** — installable to home screen on iOS/Android

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router (TypeScript) |
| Styling | Tailwind CSS v4 |
| Database | Turso (libSQL / SQLite cloud) |
| Deployment | Vercel (GitHub auto-deploy) |
| Translation | MyMemory free API |
| Content | Rosetta Stone PDFs parsed with pdfplumber |

## Database Schema

```sql
card_states     -- SM-2 state per item (ease factor, interval, next review date)
review_log      -- every individual rating (used for streak, calendar, weak spots)
custom_cards    -- user-added Dutch sentences
translations    -- cached EN translations keyed by item ID
```

## Local Development

```bash
npm install
npm run dev
```

Requires a `.env.local` file:

```env
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token

SITE_PASSWORD=your-password
COOKIE_SECRET=a-long-random-string   # openssl rand -base64 32
```

Without `TURSO_DATABASE_URL`, the app falls back to a local SQLite file at `data/reviews.db`.

## Deployment

Push to `main` → Vercel auto-deploys. Set the four env vars above in **Vercel → Settings → Environment Variables**.

## Content Pipeline

Vocabulary is extracted from Rosetta Stone's publicly available course content PDFs using `scripts/parse_pdfs.py` (pdfplumber, coordinate-based two-column layout) and saved to `content/units.json`. Items without terminal punctuation (vocab-list cards that rely on images) are filtered out at runtime.

PDFs for all supported languages are available at:
**https://support.rosettastone.com/rosetta-stone-course-contents/**

```bash
cd scripts && python parse_pdfs.py
```

> **Content attribution:** Vocabulary and example sentences in `content/units.json` are sourced from Rosetta Stone's publicly available course content PDFs. This project is personal/educational and non-commercial.

### Other Languages

Since Rosetta Stone publishes course PDFs for many languages (Spanish, French, Japanese, Mandarin, etc.), the pipeline can generate a `units.json` for any of them. The app itself is language-agnostic — swap in a different `units.json` and update the UI labels.

## Project Structure

```
src/
  app/
    page.tsx              # Home — Review tab, My Vocabulary, Units, Stats
    review/page.tsx       # Infinite review session page
    api/
      reviews/            # GET session cards (blended forward+reverse), POST ratings
      cards/              # GET all studied cards for Cards browser
      custom-cards/       # CRUD for personal vocabulary cards
      counts/             # Studied / reverse-ready / total counts
      stats/              # Streak, calendar, weak spots
      translations/       # Save a newly fetched translation to cache
      auth/login/         # Password login → sets 1-year session cookie
  components/
    ReviewSession.tsx     # Infinite flashcard UI with rolling queue + session dedup
    CardsList.tsx         # Filterable/sortable studied-cards list
    StatsPanel.tsx        # Streak + activity calendar + weak spots
    UnitGrid.tsx          # Unit progress selector
  lib/
    db.ts                 # All Turso/libSQL DB functions (SM-2, custom cards, etc.)
    content.ts            # Load and filter vocabulary items from units.json
  middleware.ts           # Auth gate — redirects unauthenticated requests to /login
content/
  units.json              # Parsed Rosetta Stone vocabulary (~1,800 items, 6 units)
scripts/
  parse_pdfs.py           # PDF → units.json extraction pipeline
```
