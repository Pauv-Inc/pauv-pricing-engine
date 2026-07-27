# PAUV Pricer (SCRUM-21)

A **reference pricer** for adding a new person to PAUV. Give their social
handles, pull (or enter) follower counts, and get a suggested price — a human
always types the final number.

Built in the same visual language as `vbc simulation` (Next.js 16, Tailwind v4,
Geist, dark zinc / violet / emerald).

## What it implements

SCRUM-21 specifies a per-platform linear rule for Instagram + X, each producing
an independent suggested price a human references. This build keeps that
**exactly**, and extends it (the "merge" decision) with weighted multi-platform
blending and an optional sentiment tilt.

### Per-platform formula (exact, from the ticket)

```
price(f) = f <= minFollowers  -> priceFloor (0.01)
           else priceFloor + (priceAt100k - priceFloor)
                  * (f - minFollowers) / (100000 - minFollowers)
```

Verified against the ticket's worked examples: IG (min 3000, $1.50 @ 100k) with
100,136 followers → **$1.5021**; X (min 200, $4.00 @ 100k) with 12,009 → **$0.4821**.

### The pipeline

1. **Per platform** — followers → price via the formula above (4 decimals).
2. **Combine** — weighted average across the platforms a person actually uses.
3. **Sentiment tilt** (optional) — `suggested = combined · (1 + λ · sentiment)`,
   where sentiment is VADER over pasted headlines/posts.
4. **You decide** — the suggestion pre-fills an editable final-price field.

## Follower APIs

- `/api/x-followers` (X API v2) and `/api/instagram-followers` (Apify) are
  implemented per the ticket contract, **server-side only** (tokens never reach
  the browser, never `NEXT_PUBLIC_`).
- **Mock-first:** until `X_BEARER_TOKEN` / `APIFY_API_TOKEN` are set in
  `.env.local` (see `.env.local.example`), the Fetch buttons return a clear
  "configure token" message and you enter followers by hand. Add the tokens and
  Fetch goes live — no code change. The X token must be stored URL-encoded and
  is sent verbatim.
- TikTok / YouTube / Reddit have no API yet — manual entry, but still weighted
  into the blend.

## Run

```bash
npm install
npm run dev     # http://localhost:3000
```

Config (per-platform anchors, weights, sentiment λ) is saved to the browser
automatically. See `/docs` in the app for the full explanation.
