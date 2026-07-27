import { NextResponse } from "next/server";

// ============================================================
// GET /api/tiktok-followers?username=<handle | @handle | url>
// ============================================================
// TikTok has no official free follower API, so we use Apify (the same token as
// the Instagram scraper). Server-side only; mock-first (501 until token set).
//
// The actor is configurable via APIFY_TIKTOK_ACTOR (default: a clockworks
// profile scraper). Follower count field names vary by actor, so extraction
// checks several common shapes — if your chosen actor returns a different field,
// swap the actor or extend extractFollowers().
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Apify run-sync can take a while

const ACTOR = process.env.APIFY_TIKTOK_ACTOR || "clockworks~tiktok-profile-scraper";

function normalizeHandle(input: string): string {
  const s = input.trim();
  const urlMatch = s.match(/tiktok\.com\/@?([A-Za-z0-9_.]+)/i);
  if (urlMatch) return urlMatch[1];
  return s.replace(/^@/, "");
}

// Follower count lives under different keys depending on the actor.
function extractFollowers(item: Record<string, unknown>): number | null {
  const authorMeta = (item.authorMeta ?? {}) as Record<string, unknown>;
  const stats = (item.stats ?? {}) as Record<string, unknown>;
  const userInfoStats = (((item.userInfo ?? {}) as Record<string, unknown>).stats ?? {}) as Record<string, unknown>;
  const candidates = [
    item.followersCount, item.fans, item.followers,
    authorMeta.fans, authorMeta.followers,
    stats.followerCount, stats.followers,
    userInfoStats.followerCount,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function extractName(item: Record<string, unknown>): string | null {
  const authorMeta = (item.authorMeta ?? {}) as Record<string, unknown>;
  return (item.nickName || item.nickname || item.name || authorMeta.nickName || authorMeta.name || null) as string | null;
}

export async function GET(request: Request) {
  const username = new URL(request.url).searchParams.get("username");
  if (!username || !username.trim()) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "TikTok follower lookup not configured. Set APIFY_API_TOKEN in .env.local (server-side), then Fetch again. Until then, enter followers manually." },
      { status: 501 }
    );
  }

  const handle = normalizeHandle(username);

  try {
    const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      // clockworks profile scrapers take `profiles`; harmless extra keys are ignored.
      body: JSON.stringify({ profiles: [handle], resultsPerPage: 1, shouldDownloadVideos: false }),
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
        { error: `TikTok follower count not found for ${handle} (actor ${ACTOR}). Try a different APIFY_TIKTOK_ACTOR or enter manually.` },
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
      { error: err instanceof Error ? err.message : "TikTok lookup failed" },
      { status: 500 }
    );
  }
}
