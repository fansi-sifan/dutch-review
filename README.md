# 🇳🇱 Rosetta Stone Companion

A spaced-repetition flashcard app that turns your Rosetta Stone course PDFs into an active recall practice tool — forward (read Dutch, recall meaning) and reverse (read English, produce Dutch).

Built with Next.js + Turso, deployed on Vercel. Originally made for Dutch; works for any language Rosetta Stone publishes.

**Live demo:** _(password-protected — see Setup to run your own)_

---

## How it works

1. Download the course content PDF for your language from Rosetta Stone's public support page
2. Run the parser script → generates `content/units.json`
3. Deploy to Vercel + Turso (free tiers)
4. Study — the app schedules cards using SM-2 spaced repetition

---

## Features

- **SM-2 spaced repetition** — forgot → tomorrow, hard → 1 day, easy → interval grows (1 → 4 → 10 → 25 days…)
- **Infinite sessions** — keep going as long as you like, exit anytime; progress saves per card
- **Blended forward + reverse** — NL→EN recognition mixed with EN→NL production for cards you've mastered
- **10 due + 10 new per batch** — always sees new vocabulary alongside reviews
- **Custom vocabulary cards** — add your own sentences from real life; they join the SRS queue
- **Translation caching** — English translations fetched once via MyMemory API and cached forever
- **Stats dashboard** — streak, activity calendar, weak spots
- **Cards browser** — filter by Due / Struggling / Strong / My Cards, sort by next review, forget rate, etc.
- **Password protection** — HMAC-signed cookie, enter once per browser (1-year session)
- **PWA** — installable to iOS/Android home screen

---

## Setup

### Prerequisites

- Node.js 18+
- Python 3.9+ with `pdfplumber` (`pip install pdfplumber`)
- A free [Turso](https://turso.tech) account
- A [Vercel](https://vercel.com) account

### 1. Get the course PDF

Go to **https://support.rosettastone.com/rosetta-stone-course-contents/** and download the PDF for your language (Dutch, Spanish, French, Japanese, etc.).

### 2. Parse the PDF

```bash
# Put your PDF in scripts/
cd scripts
python parse_pdfs.py
# → writes content/units.json
```

The script extracts sentences from the two-column PDF layout. Items that are pure vocabulary lists (no full sentences) are filtered out automatically — they don't make sense as flashcards without Rosetta Stone's images.

### 3. Set up Turso

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Create a database
turso db create my-language-review

# Get your credentials
turso db show my-language-review --url
turso db tokens create my-language-review
```

### 4. Configure environment variables

Create `.env.local`:

```env
TURSO_DATABASE_URL=libsql://your-db-name.turso.io
TURSO_AUTH_TOKEN=your-token-here

SITE_PASSWORD=choose-a-password
COOKIE_SECRET=a-long-random-string
```

Generate a secure `COOKIE_SECRET`:
```bash
openssl rand -base64 32
```

### 5. Run locally

```bash
npm install
npm run dev
# → http://localhost:3000
```

### 6. Deploy to Vercel

```bash
# Push to GitHub, then connect the repo in vercel.com
# Or use the CLI:
npm i -g vercel
vercel --prod
```

Add the same four env vars in **Vercel → your project → Settings → Environment Variables**, then redeploy.

---

## Adapting for another language

The app is language-agnostic. To use it for Spanish instead of Dutch:

1. Download the Spanish PDF from the Rosetta Stone support page
2. Run `parse_pdfs.py` against it → new `content/units.json`
3. Update any Dutch-specific labels in the UI (search for `"🇳🇱"` and `"Dutch"` in `src/`)
4. Deploy

The translation API (MyMemory) supports any language pair — update the `langpair` parameter in `ReviewSession.tsx`:
```typescript
// Change nl|en to your language code
`https://api.mymemory.translated.net/get?q=...&langpair=nl|en`
```

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router (TypeScript) |
| Styling | Tailwind CSS v4 |
| Database | Turso (libSQL / SQLite cloud) |
| Deployment | Vercel |
| Translations | MyMemory free API |
| Content | Rosetta Stone public course PDFs |

---

## Database Schema

Four tables, auto-created on first run:

```sql
card_states     -- SM-2 state per item (ease factor, interval, next review date)
review_log      -- every individual rating (streak, calendar, weak spots)
custom_cards    -- user-added sentences
translations    -- cached translations keyed by item ID
```

---

## Project Structure

```
src/
  app/
    page.tsx              # Home — Review, My Vocabulary, Units, Stats tabs
    review/page.tsx       # Infinite review session
    login/page.tsx        # Password login page
    api/
      reviews/            # GET session cards (blended), POST ratings
      cards/              # GET all studied cards for Cards browser
      custom-cards/       # CRUD for personal vocabulary
      counts/             # Studied / reverse-ready / total counts
      stats/              # Streak, calendar, weak spots
      translations/       # Save a fetched translation to cache
      auth/login/         # Password login → 1-year session cookie
  components/
    ReviewSession.tsx     # Infinite flashcard UI with rolling queue + dedup
    CardsList.tsx         # Filterable/sortable studied-cards list
    StatsPanel.tsx        # Streak + activity calendar + weak spots
    UnitGrid.tsx          # Unit progress selector
  lib/
    db.ts                 # All Turso DB functions (SM-2, custom cards, etc.)
    content.ts            # Load and filter vocabulary from units.json
  middleware.ts           # Auth gate — redirects unauthenticated requests to /login
content/
  units.json              # Parsed course vocabulary (generated by parse_pdfs.py)
scripts/
  parse_pdfs.py           # PDF → units.json extraction pipeline
```

---

## Content Attribution

Vocabulary and example sentences in `content/units.json` are sourced from Rosetta Stone's publicly available course content PDFs:
**https://support.rosettastone.com/rosetta-stone-course-contents/**

This project is personal/educational and non-commercial.
