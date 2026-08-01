import { NextResponse } from "next/server";
import { computeSuggestion, defaultConfig } from "@/lib/pricer";
import { PLATFORMS, type Platform } from "@/lib/types";

// ============================================================
// POST /api/price   { name?, handles?, followers?, wikipediaViews?, sentiment?, discover? }
// ============================================================
// The integration endpoint the PAUV website calls when someone lists themselves:
// give it a name and/or handles and it returns a suggested initial price, using
// the deployed v3 config. If followers aren't supplied it will auto-discover them
// (Playwright agent, /api/discover) unless discover:false.
//
// Auth: set PRICE_API_SECRET; callers must send it as `x-pauv-secret`.
// CORS: PRICE_ALLOWED_ORIGIN (default "*") — but prefer server-to-server calls.
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": process.env.PRICE_ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-pauv-secret",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  const headers = corsHeaders();

  const secret = process.env.PRICE_API_SECRET;
  if (secret && request.headers.get("x-pauv-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  }

  let body: {
    name?: string;
    handles?: Partial<Record<Platform, string>>;
    followers?: Partial<Record<Platform, number>>;
    wikipediaViews?: number | null;
    sentiment?: number | null;
    discover?: boolean;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers }); }

  const name = (body.name || "").trim();
  let followers = body.followers;

  // Auto-discover follower counts when not supplied (opt-out with discover:false).
  let discoverErrors: Record<string, string> | undefined;
  if (!followers && body.discover !== false && (name || body.handles)) {
    try {
      const r = await fetch(new URL("/api/discover", request.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, handles: body.handles }),
      });
      const d = await r.json();
      followers = (d.results || {}) as Partial<Record<Platform, number>>;
      discoverErrors = d.errors;
    } catch (e) {
      discoverErrors = { _: String(e instanceof Error ? e.message : e) };
    }
  }

  const followerMap = Object.fromEntries(
    PLATFORMS.map((p) => [p, followers?.[p] ?? null])
  ) as Record<Platform, number | null>;

  const result = computeSuggestion(
    followerMap,
    defaultConfig(),
    body.sentiment ?? null,
    body.wikipediaViews ?? null
  );

  return NextResponse.json(
    {
      name: name || null,
      suggested: result.suggested,
      reachPrice: result.reachPrice,
      hasSignal: result.hasSignal,
      followers: followerMap,
      perPlatform: result.perPlatform,
      wikipedia: result.wikipedia,
      discoverErrors,
    },
    { headers }
  );
}
