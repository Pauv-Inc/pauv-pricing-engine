import { NextResponse } from "next/server";

// ============================================================
// GET /api/youtube-followers?username=<handle | @handle | url | channelId>
// ============================================================
// Official YouTube Data API v3. FREE within a daily quota (10,000 units/day by
// default); channels.list costs 1 unit per lookup, so ~10,000 lookups/day free.
// Server-side only; mock-first (501 until YOUTUBE_API_KEY set).
//
// Returns subscriberCount as "followersCount" to match the other routes.
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 300;

interface YTChannel {
  snippet?: { title?: string; thumbnails?: { default?: { url?: string } } };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
}

// Parse a handle, @handle, /@handle URL, /channel/UC... URL, or bare channelId.
function parseInput(raw: string): { handle?: string; channelId?: string } {
  const s = raw.trim();
  const chan = s.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{20,})/i);
  if (chan) return { channelId: chan[1] };
  if (/^UC[A-Za-z0-9_-]{20,}$/.test(s)) return { channelId: s };
  const atUrl = s.match(/youtube\.com\/@([A-Za-z0-9_.-]+)/i);
  if (atUrl) return { handle: atUrl[1] };
  return { handle: s.replace(/^@/, "") };
}

export async function GET(request: Request) {
  const username = new URL(request.url).searchParams.get("username");
  if (!username || !username.trim()) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "YouTube follower lookup not configured. Set YOUTUBE_API_KEY in .env.local (server-side), then Fetch again. Until then, enter subscribers manually." },
      { status: 501 }
    );
  }

  const { handle, channelId } = parseInput(username);

  try {
    const base = "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics";
    // forHandle resolves @handles in one 1-unit call; channelId via id.
    let url = channelId
      ? `${base}&id=${encodeURIComponent(channelId)}&key=${key}`
      : `${base}&forHandle=${encodeURIComponent("@" + (handle || ""))}&key=${key}`;

    let resp = await fetch(url, { cache: "no-store" });
    let data = (await resp.json()) as { items?: YTChannel[]; error?: { message?: string } };

    // Fallback: some older channels resolve by legacy username, not handle.
    if (resp.ok && (!data.items || data.items.length === 0) && handle) {
      url = `${base}&forUsername=${encodeURIComponent(handle)}&key=${key}`;
      resp = await fetch(url, { cache: "no-store" });
      data = (await resp.json()) as { items?: YTChannel[]; error?: { message?: string } };
    }

    if (!resp.ok) {
      return NextResponse.json({ error: data?.error?.message || `YouTube API error ${resp.status}` }, { status: 502 });
    }
    const ch = data.items?.[0];
    if (!ch) {
      return NextResponse.json({ error: `YouTube channel not found: ${handle || channelId}` }, { status: 404 });
    }
    if (ch.statistics?.hiddenSubscriberCount) {
      return NextResponse.json({ error: "This channel hides its subscriber count." }, { status: 404 });
    }

    const followersCount = Number(ch.statistics?.subscriberCount ?? NaN);
    if (!Number.isFinite(followersCount)) {
      return NextResponse.json({ error: "No subscriber count available." }, { status: 404 });
    }

    return NextResponse.json({
      username: handle || channelId,
      followersCount,
      fullName: ch.snippet?.title ?? null,
      profilePic: ch.snippet?.thumbnails?.default?.url ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "YouTube lookup failed" },
      { status: 500 }
    );
  }
}
