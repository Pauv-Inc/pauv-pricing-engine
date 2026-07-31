// ============================================================
// PAUV PRICER  —  reference implementation
// ============================================================
// Implements SCRUM-21's per-platform reference pricer, extended into an ADDITIVE
// multi-signal model. Every output is a SUGGESTION — a human types the final price.
//
// Pipeline (see computeSuggestion for the authoritative version):
//   1. Per signal (each platform's followers, and Wikipedia 30-day pageviews) →
//      a price via a piecewise curve: floor at/below the minimum, LINEAR up to an
//      anchor (100k followers / anchorViews), then a SATURATING log above the
//      anchor (no ceiling, diminishing returns; C1-continuous so values at/below
//      the anchor are exactly the ticket's linear formula).
//   2. reach = Σ included platforms (weight · price)  +  Wikipedia (weight · price · damping)
//      - "included" = a real count strictly above the signal's minimum; blank / 0 /
//        below-minimum contribute NOTHING (never a $0.01 that drags the price down).
//      - additive, NOT an average: adding a signal can only raise the price.
//      - Wikipedia is DAMPED by existing social reach (followers + Wikipedia are
//        correlated fame signals, so summing both in full double-counts).
//   3. Sentiment tilt: suggested = reach · (1 + sentimentWeight · sentiment), applied
//      ONLY when reach >= sentimentMinReach. Sentiment refines a price, never creates one.
//   4. Floor only — there is NO price cap. No reach at all → null (price manually).
//
// Exact formulas, defaults, and worked examples are in the /docs page ("Exact spec").
// ============================================================

import { PLATFORMS, type Platform, type PlatformRule, type WikipediaRule, type PricerConfig } from "./types";

export const ANCHOR_FOLLOWERS = 100_000;

export function defaultConfig(): PricerConfig {
  // Defaults are the admin-tuned "v3" model. minFollowers is the inclusion
  // threshold — at/below it a profile is excluded and floored — kept low so a
  // typical personal account (IG ~150-250, X <~100, TikTok <~100, YouTube ~0-50)
  // still clears the bar. priceAt100k and weight are the per-platform anchors.
  const rule = (minFollowers: number, priceAt100k: number, weight: number): PlatformRule => ({
    minFollowers,
    priceAt100k,
    weight,
  });
  return {
    rules: {
      // weight is a per-platform multiplier on the price that adds to reach.
      x: rule(50, 2.0, 1.35),
      instagram: rule(100, 1.9, 0.9),
      tiktok: rule(50, 1.75, 0.5),
      youtube: rule(25, 2.0, 1.25),
      // LinkedIn: hardest platform to reach 100k followers (no viral engine,
      // professional audience), but lowest cultural/tradeable relevance per
      // follower for a celebrity index — those offset to a moderate 0.8 weight.
      // No follower API, so it's manual-entry only.
      linkedin: rule(100, 2.0, 0.8),
    },
    // Wikipedia pageviews — the SOLE reach signal for no-socials figures
    // (actors, directors, politicians), so it's anchored richer than a follower:
    // a pageview (someone actively reading about you) is a stronger signal than a
    // passive follow. Below 2k/30d contributes nothing; 100k/30d ≈ $10, then the
    // curve saturates. Calibrated so a heavy-coverage figure (Nolan, ~1.9M/30d)
    // lands ≈ $45 ≈ his real pauv price.
    wikipedia: { minViews: 2000, anchorViews: 100_000, priceAtAnchor: 10.0, weight: 1.15 },
    sentimentWeight: 0.2, // tilt strength: ±20% at full ±1 sentiment
    // Sentiment only tilts once reach reaches this price — below it, scraped text
    // has no effect (a person needs real presence before sentiment matters).
    sentimentMinReach: 5,
    // A followed person's Wikipedia adds ~40% of its value (fame already counted
    // by followers); a no-socials person's Wikipedia counts in full. 0 = off.
    wikipediaSocialDamping: 0.6,
    priceFloor: 0.01,
    // Soft-cap the top by default (diminishing returns above 100k). Toggle off for
    // pure linear extrapolation (unbounded — prices climb at full slope).
    saturateTop: true,
  };
}

// Suggested price for a single platform. Up to the 100k anchor this is the exact
// ticket formula (linear, floor at/below minFollowers → priceAt100k at 100k).
// ABOVE the anchor it SATURATES: instead of extrapolating the line (which runs
// away — 5M followers → $100, 50M → $1,000), it continues as a logarithm that is
// tangent to the line at the anchor. So there's NO ceiling (the biggest still
// price higher and stay ranked, IPO-style), but growth is diminishing-returns
// slow. C1-continuity means values at/near the anchor are unchanged (the ticket
// examples still hold exactly).
export function platformPrice(
  followers: number,
  rule: PlatformRule,
  priceFloor: number,
  saturateTop: boolean = true
): number {
  if (!Number.isFinite(followers) || followers <= rule.minFollowers) return priceFloor;
  const denom = ANCHOR_FOLLOWERS - rule.minFollowers;
  if (denom <= 0) return priceFloor; // guard: minFollowers >= 100k
  const slope = (rule.priceAt100k - priceFloor) / denom; // linear $/follower below the anchor
  let p: number;
  if (followers <= ANCHOR_FOLLOWERS || !saturateTop) {
    // Linear (the ticket formula). When saturateTop is off this also covers above
    // the anchor — the line just continues, unbounded.
    p = priceFloor + slope * (followers - rule.minFollowers);
  } else {
    // Saturating log above the anchor. k = anchor·slope makes d/df match the
    // line's slope at the anchor (smooth join); value at the anchor = priceAt100k.
    const k = ANCHOR_FOLLOWERS * slope;
    p = rule.priceAt100k + k * Math.log(followers / ANCHOR_FOLLOWERS);
  }
  return Math.max(priceFloor, p);
}

// Wikipedia pageviews → price, same shape as a platform: linear up to anchorViews,
// then (if saturateTop) a saturating log above it; otherwise linear/unbounded.
export function wikipediaPrice(views: number, rule: WikipediaRule, priceFloor: number, saturateTop: boolean = true): number {
  if (!Number.isFinite(views) || views <= rule.minViews) return priceFloor;
  const denom = rule.anchorViews - rule.minViews;
  if (denom <= 0) return priceFloor;
  const slope = (rule.priceAtAnchor - priceFloor) / denom;
  let p: number;
  if (views <= rule.anchorViews || !saturateTop) {
    p = priceFloor + slope * (views - rule.minViews);
  } else {
    const k = rule.anchorViews * slope;
    p = rule.priceAtAnchor + k * Math.log(views / rule.anchorViews);
  }
  return Math.max(priceFloor, p);
}

export interface PlatformSuggestion {
  platform: Platform;
  followers: number | null;
  price: number | null;       // ticket-formula price (shown even when excluded)
  weight: number;             // per-platform multiplier (0 = off, 1 = full)
  included: boolean;          // does this platform contribute to reach?
  contribution: number;       // weight * price, added into reach (0 if excluded)
}

export interface WikipediaSuggestion {
  views: number | null;
  price: number | null;   // wiki price (shown even when excluded)
  weight: number;
  included: boolean;
  dampingFactor: number;  // <1 when social reach discounts Wikipedia (1 = full / no socials)
  contribution: number;   // weight * price * dampingFactor added to reach (0 if excluded)
}

export interface PricingResult {
  perPlatform: PlatformSuggestion[];
  wikipedia: WikipediaSuggestion; // Wikipedia pageviews component
  reachPrice: number | null;    // ADDITIVE sum of platform + wiki contributions (null = no reach)
  sentiment: number;            // LLM sentiment in [-1, 1] (0 until scored)
  hasSentiment: boolean;        // sentiment has been scored
  sentimentApplied: boolean;    // tilt actually applied (scored AND reach >= threshold)
  sentimentMultiplier: number;  // the tilt applied to reach (1 when not applied)
  suggested: number | null;     // final suggestion, floored (null = no signal)
  hasReach: boolean;            // any platform/wiki contributes
  hasSignal: boolean;           // a real suggestion exists (= has reach)
}

// ============================================================
// Combine model — ADDITIVE reach, sentiment as a strength-weighted modifier.
//
// reach = Σ over included platforms of (weight_p · platformPrice_p)
//   → adding a platform can only ADD; a single platform gives its own price
//     (weight 1). This is why more presence never lowers the price.
//
// sentiment tilts reach proportionally:  suggested = reach · (1 + w_sent · s)
//   → scale-safe: a small creator's sentiment effect stays proportional to
//     their reach instead of a flat dollar amount swamping them, and it only
//     applies once reach clears sentimentMinReach.
//
// No reach at all → no suggestion (manual / comparable). Sentiment refines an
// established price; it can't create one from nothing. A news-relevant person
// with no socials is carried by Wikipedia pageviews (which is reach), not here.
// ============================================================
export function computeSuggestion(
  followersByPlatform: Record<Platform, number | null>,
  cfg: PricerConfig,
  // Overall sentiment (-1..1) from the LLM scorer; null = not scored yet (no tilt).
  sentimentOverride: number | null = null,
  // Wikipedia 30-day pageviews (null = not looked up).
  wikipediaViews: number | null = null
): PricingResult {
  // No hard ceiling — the saturating price curve keeps the top in check; we only
  // floor. (IPOs don't have a cap.)
  const clamp = (v: number) => Math.max(cfg.priceFloor, v);

  // ---- Platform (social) contributions (additive) ----
  let socialSum = 0;
  let anySocial = false;
  const perPlatform: PlatformSuggestion[] = PLATFORMS.map((platform) => {
    const followers = followersByPlatform[platform];
    const rule = cfg.rules[platform];
    const hasCount = followers != null && Number.isFinite(followers);
    // A platform counts only with real reach: present AND above its minimum.
    // 0, blank, or below-minimum are excluded (contribute nothing, not $0.01).
    const included = hasCount && (followers as number) > rule.minFollowers;
    const price = hasCount ? platformPrice(followers as number, rule, cfg.priceFloor, cfg.saturateTop) : null;
    const weight = Math.max(0, rule.weight);
    const contribution = included && price != null ? weight * price : 0;
    if (included && contribution > 0) { socialSum += contribution; anySocial = true; }
    return { platform, followers, price, weight, included, contribution };
  });

  // ---- Wikipedia pageviews (additive reach, DAMPED by existing social reach) ----
  // Social following and Wikipedia coverage are correlated signals of the same
  // fame, so adding Wikipedia at full value on top of big socials double-counts.
  // We discount it by how much social reach already exists: no socials → full
  // Wikipedia (it's the only signal); lots of socials → Wikipedia adds only a
  // fraction. dampingFactor = (1-d) + d/(1 + social/wikiRaw): 1 when social=0,
  // approaching the floor (1-d) as social reach dwarfs the Wikipedia value.
  const wRule = cfg.wikipedia;
  const wHasCount = wikipediaViews != null && Number.isFinite(wikipediaViews);
  const wIncluded = wHasCount && (wikipediaViews as number) > wRule.minViews;
  const wPrice = wHasCount ? wikipediaPrice(wikipediaViews as number, wRule, cfg.priceFloor, cfg.saturateTop) : null;
  const wWeight = Math.max(0, wRule.weight);
  const wRaw = wIncluded && wPrice != null ? wWeight * wPrice : 0;
  const d = Math.max(0, Math.min(1, cfg.wikipediaSocialDamping));
  const dampingFactor = wRaw > 0 ? (1 - d) + d / (1 + socialSum / wRaw) : 1;
  const wContribution = wRaw * dampingFactor;

  const anyReach = anySocial || wContribution > 0;
  const reachSum = socialSum + wContribution;
  const wikipedia = { views: wikipediaViews, price: wPrice, weight: wWeight, included: wIncluded, dampingFactor, contribution: wContribution };

  const reachPrice = anyReach ? reachSum : null;

  // ---- Sentiment (from the LLM scorer; neutral until scored) ----
  const hasSentiment = sentimentOverride != null && Number.isFinite(sentimentOverride);
  const sentiment = hasSentiment ? Math.max(-1, Math.min(1, sentimentOverride as number)) : 0;

  // Sentiment only tilts once the person has reached a real presence: reach price
  // at/above the threshold. Below it (or no reach), scraped text has no effect.
  const sentimentApplied = hasSentiment && reachPrice != null && reachPrice >= cfg.sentimentMinReach;
  const sentimentMultiplier = sentimentApplied ? 1 + Math.max(0, cfg.sentimentWeight) * sentiment : 1;

  // ---- Combine: reach, tilted by sentiment only when it applies ----
  const suggested = reachPrice != null ? clamp(reachPrice * sentimentMultiplier) : null;

  return {
    perPlatform,
    wikipedia,
    reachPrice,
    sentiment,
    hasSentiment,
    sentimentApplied,
    sentimentMultiplier,
    suggested,
    hasReach: anyReach,
    hasSignal: suggested != null,
  };
}

// 4-decimal display, per the ticket ("Display 4 decimals").
export function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
