import { NextResponse } from "next/server";

// ============================================================
// GET /api/x-followers?username=<handle | @handle | url>
// ============================================================
// X (Twitter) follower count via Apify — pay-per-use, reusing APIFY_API_TOKEN
// (same token as Instagram/TikTok). This replaces the official X API v2, which
// costs a $200–$5,000/month subscription for what is just a follower number.
//
// Actor is configurable via APIFY_X_ACTOR (default: an apidojo user scraper).
// Follower field names vary by actor, so extraction checks several shapes — if
// your actor returns a different field, swap the actor or extend extractFollowers().
// Server-side only; mock-first (501 until APIFY_API_TOKEN is set).
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ACTOR = process.env.APIFY_X_ACTOR || "apidojo~twitter-user-scraper";

// Accept a bare handle, @handle, or a full x.com/twitter.com URL.
function normalizeHandle(input: string): string {
  const s = input.trim();
  const urlMatch = s.match(/(?:x\.com|twitter\.com)\/(?:#!\/)?@?([A-Za-z0-9_]{1,15})/i);
  if (urlMatch) return urlMatch[1];
  return s.replace(/^@/, "");
}

function extractFollowers(item: Record<string, unknown>): number | null {
  const pub = (item.public_metrics ?? {}) as Record<string, unknown>;
  const legacy = (item.legacy ?? {}) as Record<string, unknown>;
  const stats = (item.stats ?? {}) as Record<string, unknown>;
  const candidates = [
    item.followers, item.followersCount, item.followers_count,
    pub.followers_count, legacy.followers_count, stats.followers,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function extractName(item: Record<string, unknown>): string | null {
  const legacy = (item.legacy ?? {}) as Record<string, unknown>;
  return (item.name || item.displayName || item.fullName || legacy.name || null) as string | null;
}

export async function GET(request: Request) {
  const username = new URL(request.url).searchParams.get("username");
  if (!username || !username.trim()) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "X follower lookup not configured. Set APIFY_API_TOKEN in .env.local (server-side), then Fetch again. Until then, enter followers manually." },
      { status: 501 }
    );
  }

  const handle = normalizeHandle(username);

  try {
    const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      // apidojo user scraper takes `twitterHandles`; harmless extra keys are ignored.
      body: JSON.stringify({ twitterHandles: [handle], maxItems: 1, getFollowers: false }),
      cache: "no-store",
    });
    if (!resp.ok) {
      return NextResponse.json({ error: `Apify error ${resp.status}` }, { status: 502 });
    }

    const items = (await resp.json()) as Record<string, unknown>[];
    const item = Array.isArray(items) ? items[0] : undefined;
    const followersCount = item ? extractFollowers(item) : null;
    if (!item || followersCount == null) {
      return NextResponse.json(
        { error: `X follower count not found for ${handle} (actor ${ACTOR}). Try a different APIFY_X_ACTOR or enter manually.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      username: handle,
      followersCount,
      fullName: item ? extractName(item) : null,
      profilePic: null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "X lookup failed" },
      { status: 500 }
    );
  }
}
