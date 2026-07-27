import { NextResponse } from "next/server";
import Parser from "rss-parser";

// ============================================================
// GET /api/news?name=<person>&max=12
// ============================================================
// Pulls recent text ABOUT a person from three sources and merges them:
//   • Google News RSS — press coverage (free, no key)
//   • Reddit search JSON — social discussion (free, no key)
//   • YouTube comments — public reaction on videos about the person
//     (requires YOUTUBE_API_KEY; skipped gracefully if absent)
// Any source failing degrades gracefully — the others still return.
//
// YouTube quota note: finding videos uses search.list (100 units) + a
// commentThreads.list per video (1 unit each), so ~100+ units PER lookup — far
// more than the follower lookup's 1 unit. At scale this is the YouTube cost
// driver (see docs). It's opt-in via the key.
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 1800; // cache 30 min per query

const rss = new Parser({ timeout: 15000 });

interface Headline {
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
}

function cleanTitle(title: string): string {
  if (!title) return "";
  // Google News appends " - Source"; strip it for a clean headline.
  return title.replace(/\s+-\s+[^-]+$/, "").trim();
}

function sourceFromTitle(title: string): string {
  const m = title?.match(/\s+-\s+([^-]+)$/);
  return m ? m[1].trim().slice(0, 60) : "News";
}

async function fetchGoogleNews(name: string): Promise<Headline[]> {
  const q = encodeURIComponent(`"${name}"`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  const feed = await rss.parseURL(url);
  return (feed.items || []).map((item) => ({
    title: cleanTitle(item.title || ""),
    source: sourceFromTitle(item.title || ""),
    url: item.link || "",
    publishedAt: item.isoDate || item.pubDate || null,
  }));
}

interface RedditChild {
  data?: { title?: string; subreddit?: string; permalink?: string; created_utc?: number };
}
async function fetchReddit(name: string): Promise<Headline[]> {
  const q = encodeURIComponent(`"${name}"`);
  const url = `https://www.reddit.com/search.json?q=${q}&sort=new&limit=15&type=link`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "PauvPricer/1.0 (sentiment source)" },
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`Reddit ${resp.status}`);
  const data = (await resp.json()) as { data?: { children?: RedditChild[] } };
  const children = data.data?.children ?? [];
  return children.map((c) => ({
    title: (c.data?.title || "").trim(),
    source: c.data?.subreddit ? `Reddit r/${c.data.subreddit}` : "Reddit",
    url: c.data?.permalink ? `https://www.reddit.com${c.data.permalink}` : "",
    publishedAt: c.data?.created_utc ? new Date(c.data.created_utc * 1000).toISOString() : null,
  }));
}

// YouTube comments on videos ABOUT the person — public reaction, not fans on
// the person's own channel. Search for the name → top videos → their comments.
// Opt-in via YOUTUBE_API_KEY; any failure returns []. (search.list = 100 units.)
interface YTSearchItem { id?: { videoId?: string } }
interface YTCommentItem { snippet?: { topLevelComment?: { snippet?: { textDisplay?: string } } } }
async function fetchYouTubeComments(name: string): Promise<Headline[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const searchUrl =
    `https://www.googleapis.com/youtube/v3/search?part=id&type=video&order=relevance&maxResults=2` +
    `&q=${encodeURIComponent(name)}&key=${key}`;
  const sResp = await fetch(searchUrl, { cache: "no-store" });
  if (!sResp.ok) throw new Error(`YouTube search ${sResp.status}`);
  const sData = (await sResp.json()) as { items?: YTSearchItem[] };
  const videoIds = (sData.items || []).map((i) => i.id?.videoId).filter(Boolean) as string[];

  const perVideo = await Promise.allSettled(
    videoIds.map(async (vid) => {
      const cUrl =
        `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&order=relevance` +
        `&maxResults=6&textFormat=plainText&videoId=${vid}&key=${key}`;
      const cResp = await fetch(cUrl, { cache: "no-store" });
      if (!cResp.ok) return []; // comments disabled / 403 → skip this video
      const cData = (await cResp.json()) as { items?: YTCommentItem[] };
      return (cData.items || [])
        .map((it) => (it.snippet?.topLevelComment?.snippet?.textDisplay || "").replace(/\s+/g, " ").trim())
        .filter((t) => t.length > 0)
        .map((t) => ({ title: t.slice(0, 220), source: "YouTube comment", url: `https://youtube.com/watch?v=${vid}`, publishedAt: null }));
    })
  );
  return perVideo.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const name = params.get("name");
  const max = Math.min(30, parseInt(params.get("max") || "12", 10) || 12);

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const person = name.trim();

  // Fetch all sources concurrently; any failing shouldn't sink the request.
  const [newsRes, redditRes, ytRes] = await Promise.allSettled([
    fetchGoogleNews(person),
    fetchReddit(person),
    fetchYouTubeComments(person),
  ]);

  const news = newsRes.status === "fulfilled" ? newsRes.value : [];
  const reddit = redditRes.status === "fulfilled" ? redditRes.value : [];
  const youtube = ytRes.status === "fulfilled" ? ytRes.value : [];

  if (newsRes.status === "rejected" && redditRes.status === "rejected" && youtube.length === 0) {
    return NextResponse.json({ error: "All sources failed" }, { status: 502 });
  }

  // Interleave so the sample isn't dominated by one source, dedupe.
  const seen = new Set<string>();
  const merged: Headline[] = [];
  const cols = [news, reddit, youtube];
  const maxLen = Math.max(...cols.map((c) => c.length));
  for (let i = 0; i < maxLen; i++) {
    for (const col of cols) {
      const h = col[i];
      if (!h || !h.title) continue;
      const key = h.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(h);
    }
  }

  return NextResponse.json({
    name: person,
    count: merged.length,
    sources: {
      news: news.length,
      reddit: reddit.length,
      youtube: youtube.length,
      redditError: redditRes.status === "rejected",
      youtubeError: ytRes.status === "rejected",
    },
    headlines: merged.slice(0, max),
  });
}
