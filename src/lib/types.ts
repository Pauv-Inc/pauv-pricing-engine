// ============================================================
// Shared types for the PAUV Pricer Config + Application.
// ============================================================

// Reach platforms — the ones whose FOLLOWER counts drive a per-platform price.
// Instagram + X are the two the SCRUM-21 ticket wires to real APIs; TikTok and
// YouTube are configurable extras (the "forum-weight" idea). Reddit is
// deliberately NOT here — follower counts aren't a meaningful Reddit metric; it
// feeds sentiment instead (see SENTIMENT_SOURCES).
export const PLATFORMS = ["x", "instagram", "tiktok", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  x: "X",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

// Which reach platforms have a real follower-lookup API wired.
// X + Instagram (SCRUM-21), TikTok (Apify), YouTube (YouTube Data API).
export const API_PLATFORMS: Record<Platform, boolean> = {
  x: true,
  instagram: true,
  tiktok: true,
  youtube: true,
};

// Maps a platform to its follower-lookup route.
export const FOLLOWER_ROUTES: Record<Platform, string> = {
  x: "/api/x-followers",
  instagram: "/api/instagram-followers",
  tiktok: "/api/tiktok-followers",
  youtube: "/api/youtube-followers",
};

// Sources the sentiment scraper pulls from. YouTube comments require
// YOUTUBE_API_KEY (skipped gracefully without it). X posts, LinkedIn, etc. are
// not wired.
export const SENTIMENT_SOURCES = ["Google News", "Reddit", "YouTube comments"] as const;

// Per-platform pricing rule (the admin-set anchors from the ticket).
export interface PlatformRule {
  minFollowers: number; // at or below this, the platform is excluded (would be floor-priced)
  priceAt100k: number;  // suggested price at exactly 100,000 followers ($)
  weight: number;       // multiplier on this platform's price when SUMMED into reach (1 = full)
}

// Wikipedia pageviews — a coverage-VOLUME signal, its own weighted reach
// component. Same linear shape as a platform, but keyed on 30-day pageviews.
export interface WikipediaRule {
  minViews: number;      // at/below this, excluded (contributes nothing)
  anchorViews: number;   // pageviews at which the price equals priceAtAnchor
  priceAtAnchor: number; // price ($) at anchorViews
  weight: number;        // multiplier on the wiki price when summed into reach
}

export interface PricerConfig {
  rules: Record<Platform, PlatformRule>;
  wikipedia: WikipediaRule; // Wikipedia pageviews as a weighted reach component
  priceFloor: number;      // the flat price at/below minFollowers (ticket: $0.01)
  // Above the 100k anchor: true = diminishing-returns SATURATING curve (soft-caps
  // the top); false = pure LINEAR extrapolation (unbounded, prices climb freely).
  saturateTop: boolean;
  sentimentWeight: number; // tilt strength: reach * (1 + sentimentWeight * sentiment)
  sentimentMinReach: number; // sentiment only tilts once reach price >= this ($)
  // How much existing SOCIAL reach discounts the Wikipedia contribution (0..1).
  // 0 = never discount (pure additive); 0.6 = a heavily-followed person's Wikipedia
  // adds only ~40% of its value (their fame is already counted by followers), while
  // a no-socials person's Wikipedia always counts in full.
  wikipediaSocialDamping: number;
}

// A person's per-platform handle + follower count (mock/manual for now).
export interface PlatformInput {
  handle: string;
  followers: number | null; // null = not looked up yet
}

export interface PersonInput {
  name: string;
  platforms: Record<Platform, PlatformInput>;
  // Text gathered about the person (headlines / posts) for sentiment.
  sentimentText: string;
}
