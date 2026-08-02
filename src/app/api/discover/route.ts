import { NextResponse } from "next/server";
import { readCountFromImage, parseCount } from "@/lib/vision";

// ============================================================
// POST /api/discover   { handles?: { x, instagram, tiktok, youtube } }
// ============================================================
// The in-app "agent": for each pasted handle / profile URL, it drives a REAL
// Chromium (Playwright) — logged into your accounts, on THIS machine's IP —
// opens that exact profile, reads the follower count from the page (DOM/JSON),
// and if that fails, screenshots it and a vision model reads the number off the
// image. YouTube uses the official Data API instead of the browser.
//
// Handle/URL only (no name-search — that grabbed wrong accounts). Works only
// where the server has a residential IP + your logged-in browser profile (your
// own machine / the box behind price.pauv.com), not a datacenter. Log in once
// with `npm run pw:login`.
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    // Method 1: the rendered count element (e.g. "204.5M") — robust when the
    // followerCount JSON isn't in the served HTML.
    await page.waitForSelector('[data-e2e="followers-count"]', { timeout: 8000 }).catch(() => {});
    const domTxt = await page
      .evaluate(() => document.querySelector('[data-e2e="followers-count"]')?.textContent?.trim() || null)
      .catch(() => null);
    if (domTxt) { const c = parseCount(domTxt); if (c != null) return { count: c, method: "dom", handle }; }
    // Method 2: followerCount in the page's rehydration JSON.
    const html = await page.content();
    const m = html.match(/"followerCount":\s*(\d+)/);
    if (m) return { count: parseInt(m[1], 10), method: "json", handle };
    // Method 3: read it off a screenshot.
    const shot = (await page.screenshot()).toString("base64");
    const c = await readCountFromImage(shot, "TikTok");
    return { count: c, method: c != null ? "vision" : "none", handle };
  } finally { await page.close(); }
}

async function grabInstagram(ctx: import("playwright").BrowserContext, handle: string): Promise<Grab> {
  const page = await ctx.newPage();
  try {
    await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Method 1: IG's own profile API (exact, uses your logged-in session).
    const apiCount = await page
      .evaluate(async (h) => {
        try {
          const r = await fetch(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(h)}`, {
            headers: { "x-ig-app-id": "936619743392459" },
          });
          if (!r.ok) return null;
          const j = await r.json();
          const c = j?.data?.user?.edge_followed_by?.count;
          return typeof c === "number" ? c : null;
        } catch { return null; }
      }, handle)
      .catch(() => null);
    if (typeof apiCount === "number") return { count: apiCount, method: "api", handle };
    // Method 2: og:description meta ("1,234 Followers, 56 Following, ...").
    const og = await page
      .$eval('meta[property="og:description"]', (el) => (el as HTMLMetaElement).content)
      .catch(() => null);
    const m = og?.match(/([\d.,]+[KMB]?)\s+Followers/i);
    if (m) { const c = parseCount(m[1]); if (c != null) return { count: c, method: "meta", handle }; }
    // Method 3: read it off a screenshot (the "AI agent" fallback).
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

// YouTube via the official Data API (no browser). Takes a handle / @handle / URL /
// channelId (the /api/youtube-followers route resolves all of those). 1 unit.
// Skips silently if YOUTUBE_API_KEY isn't set.
async function grabYouTube(handle: string, origin: string): Promise<Grab | null> {
  if (!process.env.YOUTUBE_API_KEY || !handle) return null;
  const r = await fetch(new URL(`/api/youtube-followers?username=${encodeURIComponent(handle)}`, origin), { cache: "no-store" });
  const d = (await r.json()) as { followersCount?: number; username?: string; fullName?: string; error?: string };
  if (d.error || d.followersCount == null) return { count: null, method: "none", handle: d.fullName || handle };
  return { count: d.followersCount, method: "api", handle: d.username || d.fullName || handle };
}

export async function POST(request: Request) {
  let body: { handles?: Partial<Record<"x" | "instagram" | "tiktok" | "youtube" | "linkedin", string>> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const handles = body.handles || {};
  // Handle/URL only — the exact account the user pasted. No name-search (which
  // grabbed wrong/fake accounts for people without a clear real profile).
  const igHandle = normalizeHandle(handles.instagram);
  const ttHandle = normalizeHandle(handles.tiktok);
  const xHandle = normalizeHandle(handles.x);
  const ytHandle = normalizeHandle(handles.youtube);

  const needBrowser = !!(igHandle || ttHandle || xHandle);
  const needYouTube = !!ytHandle;
  if (!needBrowser && !needYouTube) {
    return NextResponse.json({ error: "Paste a handle or profile URL for at least one platform (x / instagram / tiktok / youtube)" }, { status: 400 });
  }

  const results: Record<string, number> = {};
  const resolvedHandles: Record<string, string> = {};
  const methods: Record<string, string> = {};
  const errors: Record<string, string> = {};

  // YouTube via the official API — parallel, independent of the browser.
  const ytJob = needYouTube
    ? grabYouTube(ytHandle, request.url)
        .then((g) => {
          if (!g) return; // no key → skip
          if (g.count != null) { results.youtube = g.count; methods.youtube = g.method; }
          if (g.handle) resolvedHandles.youtube = g.handle;
        })
        .catch((e) => { errors.youtube = String(e?.message || e); })
    : Promise.resolve();

  // Instagram / X / TikTok via the browser agent, each on the exact pasted handle.
  // Browser failure is per-platform, not fatal — YouTube can still resolve.
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

        const jobs: Promise<void>[] = [];
        if (igHandle) jobs.push(run("instagram", (h) => grabInstagram(ctx, h), igHandle));
        if (ttHandle) jobs.push(run("tiktok", (h) => grabTikTok(ctx, h), ttHandle));
        if (xHandle) jobs.push(run("x", (h) => grabX(ctx, h), xHandle));
        await Promise.all(jobs);
      }).catch((e) => {
        const msg = `browser unavailable — run npm run pw:install / pw:login (${e instanceof Error ? e.message : e})`;
        if (igHandle) errors.instagram = msg;
        if (ttHandle) errors.tiktok = msg;
        if (xHandle) errors.x = msg;
      })
    : Promise.resolve();

  await Promise.all([ytJob, pwJob]);

  return NextResponse.json({ results, resolvedHandles, methods, errors });
}
