import { NextResponse } from "next/server";

// ============================================================
// GET /api/instagram-followers?username=<handle | @handle | url>
// ============================================================
// SCRUM-21 contract. Pulls a follower count via the Apify
// instagram-followers-count-scraper actor. Server-side only.
//
// MOCK-FIRST: if APIFY_API_TOKEN isn't set, returns 501 so the UI falls back to
// manual entry. Add the token to .env.local to go live — no code change needed.
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // Apify run-sync is ~5–10s

function normalizeHandle(input: string): string {
  let s = input.trim();
  const urlMatch = s.match(/instagram\.com\/@?([A-Za-z0-9_.]+)/i);
  if (urlMatch) return urlMatch[1];
  s = s.replace(/^@/, "");
  return s;
}

export async function GET(request: Request) {
  const username = new URL(request.url).searchParams.get("username");
  if (!username || !username.trim()) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Instagram follower lookup not configured. Set APIFY_API_TOKEN in .env.local (server-side), then Fetch again. Until then, enter followers manually." },
      { status: 501 }
    );
  }

  const handle = normalizeHandle(username);

  try {
    const url =
      "https://api.apify.com/v2/acts/apify~instagram-followers-count-scraper/run-sync-get-dataset-items";
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ usernames: [handle] }),
      cache: "no-store",
    });

    if (!resp.ok) {
      return NextResponse.json({ error: `Apify error ${resp.status}` }, { status: 502 });
    }

    const items = (await resp.json()) as Array<{
      followersCount?: number;
      userName?: string;
      userFullName?: string;
      profilePic?: string;
      followsCount?: number;
    }>;
    const item = Array.isArray(items) ? items[0] : undefined;
    if (!item || item.followersCount == null) {
      return NextResponse.json({ error: `Instagram user not found: ${handle}` }, { status: 404 });
    }

    return NextResponse.json({
      username: item.userName ?? handle,
      followersCount: item.followersCount,
      fullName: item.userFullName ?? null,
      profilePic: item.profilePic ?? null,
      followsCount: item.followsCount ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Instagram lookup failed" },
      { status: 500 }
    );
  }
}
