import { NextResponse } from "next/server";
import { readCountFromImage, parseCount } from "@/lib/vision";

// ============================================================
// POST /api/discover   { name?, handles?: { x, instagram, tiktok, linkedin } }
// ============================================================
// The in-app "agent": drives a REAL Chromium (Playwright) that stays logged into
// your accounts and runs on THIS machine's IP. For each platform it opens the
// profile, reads the follower count from the page (DOM/JSON), and — if that
// fails — screenshots it and a vision model reads the number off the image.
//
// This only works where the server has a residential IP + your logged-in
// browser profile (i.e. your own machine / the box behind price.pauv.com), not a
// datacenter. Log in once with `npm run pw:login` before first use.
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IG_APP_ID = "936619743392459";

// Pull a handle out of a pasted profile URL, else strip @ / trailing slash.
function normalizeHandle(v: string | undefined): string {
  if (!v) return "";
  const s = v.trim();
  const m = s.match(/(?:instagram\.com|tiktok\.com|x\.com|twitter\.com|linkedin\.com\/in)\/@?([A-Za-z0-9._-]+)/i);
  return (m ? m[1] : s).replace(/^@+/, "").replace(/\/+$/, "");
}

// Launch a fresh persistent context per request and close it after, so the
// profile lock is released between requests (lets `npm run pw:login` grab it
// anytime, and avoids leaking a browser on hot-reload). A mutex serializes
// requests so two discovers never fight over the same profile dir.
let lock: Promise<void> = Promise.resolve();
async function withProfile<T>(fn: (ctx: import("playwright").BrowserContext) => Promise<T>): Promise<T> {
  const prev = lock;
  let release!: () => void;
  lock = new Promise<void>((r) => (release = r));
  await prev.catch(() => {});
  const { chromium } = await import("playwright");
  const userDataDir = process.env.PLAYWRIGHT_USER_DATA_DIR || "./.pw-profile";
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: !process.env.PW_HEADFUL,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    return await fn(ctx);
  } finally {
    await ctx.close().catch(() => {});
    release();
  }
}

type Grab = { count: number | null; method: string; handle: string };

async function grabTikTok(ctx: import("playwright").BrowserContext, handle: string): Promise<Grab> {
  const page = await ctx.newPage();
  try {
    await page.goto(`https://www.tiktok.com/@${handle}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const html = await page.content();
    const m = html.match(/"followerCount":\s*(\d+)/);
    if (m) return { count: parseInt(m[1], 10), method: "json", handle };
    const shot = (await page.screenshot()).toString("base64");
    const c = await readCountFromImage(shot, "TikTok");
    return { count: c, method: c != null ? "vision" : "none", handle };
  } finally { await page.close(); }
}

async function grabInstagram(ctx: import("playwright").BrowserContext, handle: string): Promise<Grab> {
  const page = await ctx.newPage();
  try {
    await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    // og:description reads "1,234 Followers, 56 Following, 78 Posts — ..."
    const og = await page
      .$eval('meta[property="og:description"]', (el) => (el as HTMLMetaElement).content)
      .catch(() => null);
    const m = og?.match(/([\d.,]+[KMB]?)\s+Followers/i);
    if (m) { const c = parseCount(m[1]); if (c != null) return { count: c, method: "meta", handle }; }
    const shot = (await page.screenshot()).toString("base64");
    const c = await readCountFromImage(shot, "Instagram");
    return { count: c, method: c != null ? "vision" : "none", handle };
  } finally { await page.close(); }
}

async function grabX(ctx: import("playwright").BrowserContext, handle: string): Promise<Grab> {
  const page = await ctx.newPage();
  let intercepted: number | null = null;
  page.on("response", async (res) => {
    if (!res.url().includes("UserByScreenName")) return;
    try {
      const j = (await res.json()) as { data?: { user?: { result?: { legacy?: { followers_count?: number } } } } };
      const c = j?.data?.user?.result?.legacy?.followers_count;
      if (typeof c === "number") intercepted = c;
    } catch { /* not json */ }
  });
  try {
    await page.goto(`https://x.com/${handle}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    if (intercepted != null) return { count: intercepted, method: "graphql", handle };
    const domTxt = await page
      .evaluate(() => {
        const a = document.querySelector('a[href$="/verified_followers"], a[href$="/followers"]');
        const t = a?.textContent || "";
        const m = t.match(/([\d.,]+[KMB]?)/);
        return m ? m[1] : null;
      })
      .catch(() => null);
    if (domTxt) { const c = parseCount(domTxt); if (c != null) return { count: c, method: "dom", handle }; }
    const shot = (await page.screenshot()).toString("base64");
    const c = await readCountFromImage(shot, "X");
    return { count: c, method: c != null ? "vision" : "none", handle };
  } finally { await page.close(); }
}

// Name → Instagram handle, using IG's own search from a logged-in same-origin fetch.
async function igSearchHandle(ctx: import("playwright").BrowserContext, name: string): Promise<string | null> {
  const page = await ctx.newPage();
  try {
    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    const users: { username: string; verified: boolean }[] = await page
      .evaluate(
        async ([q, appId]) => {
          const r = await fetch(`/web/search/topsearch/?context=blended&query=${encodeURIComponent(q)}`, {
            headers: { "x-ig-app-id": appId },
          });
          if (!r.ok) return [] as { username: string; verified: boolean }[];
          const j = await r.json();
          return (j.users || []).map((u: { user: { username: string; is_verified: boolean } }) => ({
            username: u.user.username,
            verified: u.user.is_verified,
          }));
        },
        [name, IG_APP_ID] as const
      )
      .catch(() => [] as { username: string; verified: boolean }[]);
    const pick = users.find((u) => u.verified) || users[0];
    return pick?.username || null;
  } finally { await page.close(); }
}

// Name → X handle via X's People search. Search is LOGIN-GATED, so if the People
// results don't render (logged out) we return null instead of guessing.
async function xSearchHandle(ctx: import("playwright").BrowserContext, name: string): Promise<string | null> {
  // Logged-out X search shows unrelated "suggested" users → wrong results. Only
  // trust name-search when actually logged in; otherwise skip (enter the handle).
  const cookies = await ctx.cookies("https://x.com").catch(() => []);
  if (!cookies.some((c) => c.name === "auth_token")) return null;
  const page = await ctx.newPage();
  try {
    await page.goto(`https://x.com/search?q=${encodeURIComponent(name)}&src=typed_query&f=user`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const ok = await page.waitForSelector('[data-testid="UserCell"]', { timeout: 9000 }).then(() => true).catch(() => false);
    if (!ok) return null; // login wall / no results
    const handle = await page
      .evaluate(() => {
        const cell = document.querySelector('[data-testid="UserCell"]');
        // The handle link is href="/<handle>" (single segment); read it, not stray @text.
        const link = cell?.querySelector('a[href^="/"][role="link"]') as HTMLAnchorElement | null;
        const fromHref = link?.getAttribute("href")?.match(/^\/(\w{1,15})$/)?.[1];
        if (fromHref) return fromHref;
        return (cell?.textContent || "").match(/@(\w{1,15})/)?.[1] ?? null;
      })
      .catch(() => null);
    return handle && /^\w{1,15}$/.test(handle) ? handle : null;
  } finally { await page.close(); }
}

// Name → TikTok handle via TikTok's search. Reads the first profile (/@handle) link.
async function ttSearchHandle(ctx: import("playwright").BrowserContext, name: string): Promise<string | null> {
  const page = await ctx.newPage();
  try {
    await page.goto(`https://www.tiktok.com/search/user?q=${encodeURIComponent(name)}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForSelector('a[href*="/@"]', { timeout: 9000 }).catch(() => {});
    const handle = await page
      .evaluate(() => {
        for (const a of Array.from(document.querySelectorAll('a[href*="/@"]'))) {
          const m = (a.getAttribute("href") || "").match(/\/@([\w.]+)(?:$|\?|\/)/);
          if (m) return m[1];
        }
        return null;
      })
      .catch(() => null);
    return handle && /^[\w.]{1,30}$/.test(handle) ? handle : null;
  } finally { await page.close(); }
}

// YouTube via the official Data API (no browser). A provided handle/URL/channelId
// costs 1 unit; resolving from a name costs a 100-unit channel search first.
// Skips silently if YOUTUBE_API_KEY isn't set.
async function grabYouTube(name: string, handle: string, origin: string): Promise<Grab | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  let query = handle;
  let title = handle;
  if (!query && name) {
    const sUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(name)}&key=${key}`;
    const sr = await fetch(sUrl, { cache: "no-store" });
    const sd = (await sr.json()) as { items?: { id?: { channelId?: string }; snippet?: { channelTitle?: string } }[] };
    const ch = sd.items?.[0];
    query = ch?.id?.channelId || "";
    title = ch?.snippet?.channelTitle || query;
    if (!query) return { count: null, method: "none", handle: "" };
  }
  if (!query) return null;
  const r = await fetch(new URL(`/api/youtube-followers?username=${encodeURIComponent(query)}`, origin), { cache: "no-store" });
  const d = (await r.json()) as { followersCount?: number; username?: string; fullName?: string; error?: string };
  if (d.error || d.followersCount == null) return { count: null, method: "none", handle: d.fullName || title };
  return { count: d.followersCount, method: "api", handle: d.username || d.fullName || title };
}

export async function POST(request: Request) {
  let body: { name?: string; handles?: Partial<Record<"x" | "instagram" | "tiktok" | "youtube" | "linkedin", string>> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (body.name || "").trim();
  const handles = body.handles || {};
  const igHandle = normalizeHandle(handles.instagram);
  const ttHandle = normalizeHandle(handles.tiktok);
  const xHandle = normalizeHandle(handles.x);
  const ytHandle = normalizeHandle(handles.youtube);

  const needBrowser = !!(igHandle || ttHandle || xHandle || name); // name → IG search
  const needYouTube = !!(ytHandle || name);
  if (!needBrowser && !needYouTube) {
    return NextResponse.json({ error: "Provide a name or handles for x/instagram/tiktok/youtube" }, { status: 400 });
  }

  const results: Record<string, number> = {};
  const resolvedHandles: Record<string, string> = {};
  const methods: Record<string, string> = {};
  const errors: Record<string, string> = {};

  // YouTube via the official API — parallel, independent of the browser.
  const ytJob = needYouTube
    ? grabYouTube(name, ytHandle, request.url)
        .then((g) => {
          if (!g) return; // no key → skip
          if (g.count != null) { results.youtube = g.count; methods.youtube = g.method; }
          if (g.handle) resolvedHandles.youtube = g.handle;
        })
        .catch((e) => { errors.youtube = String(e?.message || e); })
    : Promise.resolve();

  // Instagram / X / TikTok via the browser agent. Browser failure is per-platform,
  // not fatal — YouTube can still resolve.
  const pwJob = needBrowser
    ? withProfile(async (ctx) => {
        const run = (platform: "instagram" | "tiktok" | "x", fn: (h: string) => Promise<Grab>, handle: string) =>
          fn(handle)
            .then((g) => {
              if (g.count != null) results[platform] = g.count;
              if (g.handle) resolvedHandles[platform] = g.handle;
              methods[platform] = g.method;
            })
            .catch((e) => { errors[platform] = String(e?.message || e); });

        // Resolve any missing handles from the name (in parallel), then grab.
        const [ig, tt, xh] = await Promise.all([
          igHandle || (name ? igSearchHandle(ctx, name).catch(() => null) : null),
          ttHandle || (name ? ttSearchHandle(ctx, name).catch(() => null) : null),
          xHandle || (name ? xSearchHandle(ctx, name).catch(() => null) : null),
        ]);
        const jobs: Promise<void>[] = [];
        if (ig) jobs.push(run("instagram", (h) => grabInstagram(ctx, h), ig));
        if (tt) jobs.push(run("tiktok", (h) => grabTikTok(ctx, h), tt));
        if (xh) jobs.push(run("x", (h) => grabX(ctx, h), xh));
        await Promise.all(jobs);
      }).catch((e) => {
        const msg = `browser unavailable — run npm run pw:install / pw:login (${e instanceof Error ? e.message : e})`;
        if (igHandle || name) errors.instagram = msg;
        if (ttHandle) errors.tiktok = msg;
        if (xHandle) errors.x = msg;
      })
    : Promise.resolve();

  await Promise.all([ytJob, pwJob]);

  return NextResponse.json({ results, resolvedHandles, methods, errors });
}
