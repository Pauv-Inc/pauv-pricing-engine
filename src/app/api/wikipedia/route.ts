import { NextResponse } from "next/server";

// ============================================================
// GET /api/wikipedia?name=<person>
// ============================================================
// A coverage-VOLUME signal (magnitude, not sentiment): resolves the person's
// English Wikipedia article and sums its pageviews over the last 30 days.
// Great for news-famous figures with little social reach — they still have a
// Wikipedia article people read.
//
// Two free Wikimedia endpoints, no key:
//   1. REST summary  → resolves name to the canonical article title (redirects)
//   2. Pageviews API → daily views for that title; we sum the last 30 days
// Wikimedia requires a descriptive User-Agent — we send one.
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 3600; // pageviews update daily; cache 1h

const UA = "PauvPricer/1.0 (pricing-config; wikipedia pageviews signal)";

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Last successful (views30d, daysCounted) per article title. Survives across
// requests in a warm server process, so a transient upstream miss (the classic
// "first run of the day returns 0") falls back to the last good value instead of
// showing zero. Pageviews change slowly, so day-stale is fine.
const lastGoodViews = new Map<string, { views30d: number; daysCounted: number }>();

// Fetch daily pageviews for one window, retrying a few times on a transient
// failure (non-OK, empty body, or network error) — the cold/first-call case.
async function fetchWindowItems(
  article: string,
  startYmd: string,
  endYmd: string,
  attempts = 3
): Promise<{ views?: number; timestamp?: string }[] | null> {
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${article}/daily/${startYmd}/${endYmd}`;
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
      if (resp.ok) {
        const pv = (await resp.json()) as { items?: { views?: number; timestamp?: string }[] };
        const items = pv.items ?? [];
        if (items.length) return items;
      } else if (resp.status === 404) {
        return []; // definitively no data for this title/window — don't retry
      }
    } catch {
      // network hiccup — fall through to retry
    }
    if (i < attempts - 1) await sleep(250 * (i + 1)); // 250ms, 500ms backoff
  }
  return null; // exhausted retries without data
}

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name");
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const person = name.trim();

  try {
    // 1) Resolve the canonical article title (follows redirects/disambiguation).
    //    Retry on a transient failure so the cold first-call doesn't 502; a real
    //    404 (no article) short-circuits immediately.
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(person)}`;
    let summary: { title?: string; type?: string; content_urls?: { desktop?: { page?: string } } } | null = null;
    let notFound = false;
    for (let i = 0; i < 3; i++) {
      try {
        const summaryResp = await fetch(summaryUrl, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
        if (summaryResp.status === 404) { notFound = true; break; }
        if (summaryResp.ok) { summary = await summaryResp.json(); break; }
      } catch {
        // network hiccup — retry
      }
      if (i < 2) await sleep(250 * (i + 1));
    }
    if (notFound) {
      return NextResponse.json({ name: person, exists: false, title: null, views30d: 0 });
    }
    if (!summary) throw new Error("Wikipedia summary unavailable (after retries)");
    const title = summary.title;
    if (!title || summary.type === "disambiguation") {
      return NextResponse.json({ name: person, exists: false, title: title ?? null, views30d: 0 });
    }

    // 2) Pageviews. Wikimedia publishes with a lag (recent days aren't available
    //    yet), and a window ending "today" can come back empty — especially on the
    //    first, cache-cold request of a day. Robustness, in layers:
    //      a) each window is fetched with a few RETRIES + backoff (transient miss),
    //      b) we RETRY across progressively WIDER look-backs (publish lag / a range
    //         that returns empty),
    //      c) if every attempt still fails, fall back to the LAST GOOD value cached
    //         for this article — so a transient hiccup never shows 0.
    const WINDOW_DAYS = 30;
    const LOOKBACKS = [45, 120, 400];
    const article = encodeURIComponent(title.replace(/ /g, "_"));
    const end = new Date();
    const endYmd = yyyymmdd(end);

    let views30d = 0;
    let daysCounted = 0;
    let sawUpstreamFailure = false;
    for (const lookback of LOOKBACKS) {
      const start = new Date();
      start.setDate(start.getDate() - lookback);
      const items = await fetchWindowItems(article, yyyymmdd(start), endYmd);
      if (items === null) { sawUpstreamFailure = true; continue; } // transient — widen
      if (!items.length) continue; // definitively empty for this range → widen
      // Items are ascending by date, only for days that have data. Take the most
      // recent WINDOW_DAYS of them (skips the unpublished tail and any gaps).
      const recent = items.slice(-WINDOW_DAYS);
      daysCounted = recent.length;
      const sum = recent.reduce((s, it) => s + (it.views || 0), 0);
      // Normalize to a WINDOW_DAYS-equivalent when fewer days are available.
      views30d = daysCounted > 0 ? Math.round((sum / daysCounted) * WINDOW_DAYS) : 0;
      if (views30d > 0) break; // got a real figure — stop widening
    }

    // Cache good results; on a transient failure, serve the last good value.
    let stale = false;
    if (views30d > 0) {
      lastGoodViews.set(title, { views30d, daysCounted });
    } else if (sawUpstreamFailure && lastGoodViews.has(title)) {
      const cached = lastGoodViews.get(title)!;
      views30d = cached.views30d;
      daysCounted = cached.daysCounted;
      stale = true;
    }
    // still 0 (and no cache) = genuinely no pageview data for that title.

    return NextResponse.json({
      name: person,
      exists: true,
      title,
      url: summary.content_urls?.desktop?.page ?? null,
      views30d,
      daysCounted, // how many days of data backed the figure (for transparency)
      stale,       // true = upstream failed, served last-good cached value
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Wikipedia fetch failed" },
      { status: 502 }
    );
  }
}
