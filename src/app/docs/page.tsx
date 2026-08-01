import Link from "next/link";

export const metadata = {
  title: "Docs — PAUV Pricer",
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-base font-semibold text-zinc-100 mb-3 pb-2 border-b border-zinc-800">{title}</h2>
      <div className="space-y-3 text-sm text-zinc-400 leading-relaxed">{children}</div>
    </section>
  );
}

function Step({ n, title, formula, children }: { n: number; title: string; formula?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="flex items-center justify-center w-6 h-6 shrink-0 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-300 text-xs font-bold">{n}</span>
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
      </div>
      {formula && (
        <pre className="font-mono text-xs text-emerald-400 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 mb-2 overflow-x-auto whitespace-pre-wrap">{formula}</pre>
      )}
      <div className="text-sm text-zinc-400 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

function Param({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-zinc-800/60 align-top">
      <td className="px-3 py-2 font-mono text-xs text-violet-300 whitespace-nowrap">{name}</td>
      <td className="px-3 py-2 text-xs text-zinc-400 leading-relaxed">{children}</td>
    </tr>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">PAUV Pricer — Documentation</h1>
          <p className="text-xs text-zinc-500 mt-1">How a suggested price is built, and what every setting does</p>
        </div>
        <Link href="/" className="rounded-md border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors shrink-0">
          ← Pricer
        </Link>
      </header>

      <main className="px-6 py-8 max-w-4xl mx-auto space-y-10">
        <Section id="what" title="What this tool is">
          <p>
            A <span className="text-zinc-200 font-medium">reference pricer</span> for adding a new person to
            PAUV. You give their social handles, it pulls (or you enter) follower counts, and it suggests a
            price. A human always types the <span className="text-zinc-200">final</span> price — the suggestion
            is a starting point, not the decision.
          </p>
          <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 text-xs">
            <p className="text-violet-300 font-medium mb-1">Design (per SCRUM-21, extended)</p>
            <p className="text-zinc-400">
              The ticket specifies a per-platform linear rule for <span className="text-zinc-200">Instagram</span> and{" "}
              <span className="text-zinc-200">X</span>, each producing an independent suggested price a human
              references. This build keeps that exactly, and extends it: more platforms, combined by weight,
              with an optional sentiment tilt — so the suggestion reflects a person&apos;s whole footprint, not
              one number.
            </p>
          </div>
        </Section>

        <Section id="why" title="Why not just followers on one platform">
          <p>
            Follower count on a single platform is a weak signal on its own. Measured against real live PAUV
            prices, cross-platform follower reach explains only a few percent of what people actually trade at
            (PewDiePie: ~111M YouTube subs, ~$15; Christopher Nolan: almost no socials, ~$38). Price is driven
            by trading interest and notoriety, not audience size alone.
          </p>
          <p>
            That&apos;s the reasoning behind the design here. The tool never claims to <em>predict</em> the
            price — it produces a defensible <span className="text-zinc-200">reference</span> that a human
            adjusts. The two things that make the reference better than a single follower count are combining
            multiple platforms and tilting by sentiment; the thing that makes it <em>safe</em> is that a person
            sets the final number.
          </p>
        </Section>

        <Section id="pipeline" title="How the suggestion is built">
          <div className="space-y-3">
            <Step n={1} title="Per-platform price (piecewise)"
              formula={`slope = (priceAt100k - priceFloor) / (100000 - minFollowers)

price(f) =
  f <= minFollowers :  priceFloor
  f <= 100000       :  priceFloor  + slope * (f - minFollowers)          // linear (the ticket)
  f  > 100000       :  priceAt100k + (100000 * slope) * ln(f / 100000)   // saturating (step 4)`}>
              <p>
                For each platform, followers map to a price: the flat floor at or below the platform&apos;s
                minimum, then a straight line rising to your configured price at exactly 100,000 followers.
                <span className="text-zinc-300"> Above 100k it does NOT keep going straight</span> — it bends into
                a saturating curve (step 4) so mega-accounts don&apos;t run off to thousands of dollars. Below and
                at the anchor it&apos;s exactly the ticket&apos;s linear formula.
              </p>
              <p className="text-xs text-zinc-500">
                Worked example from the ticket — Instagram with{" "}
                <span className="font-mono text-zinc-300">minFollowers=3000</span>,{" "}
                <span className="font-mono text-zinc-300">priceAt100k=1.50</span>: a profile with{" "}
                <span className="font-mono text-zinc-300">100,136</span> followers →{" "}
                <span className="font-mono text-emerald-400">$1.5021</span>. X with{" "}
                <span className="font-mono text-zinc-300">minFollowers=200</span>,{" "}
                <span className="font-mono text-zinc-300">priceAt100k=4.00</span> and{" "}
                <span className="font-mono text-zinc-300">12,009</span> followers →{" "}
                <span className="font-mono text-emerald-400">$0.4821</span>. This build reproduces both exactly.
              </p>
            </Step>

            <Step n={2} title="Add up reach (additive)"
              formula={`reach = Σ over included platforms (weightₚ · platformPrice(fₚ))
        + weight_wiki · wikipediaPrice(v) · dampingFactor

included  =  count present AND strictly above the signal's minimum`}>
              <p>
                Each platform&apos;s price is multiplied by its weight and <span className="text-zinc-200">summed</span>
                {" "}— not averaged. This matters: because it&apos;s a sum, adding a platform can only{" "}
                <span className="text-zinc-200">raise</span> the price, never lower it. A weight of{" "}
                <span className="font-mono">1×</span> means that platform&apos;s full ticket price adds in; on a
                single platform you get exactly that platform&apos;s price.
              </p>
              <p className="text-xs text-zinc-500">
                A platform with no real reach — blank, 0, or at/below its minimum — is{" "}
                <span className="text-zinc-200">excluded, contributing nothing</span> (never a $0.01 that drags
                you down). Being huge on several platforms stacks; the saturating top keeps the total sane.
              </p>
              <p className="text-xs text-zinc-500">
                (Weights used to be shares totalling 100%, which <em>averaged</em> the platforms — that made
                adding a smaller platform pull the price down. Additive weights fix that.)
              </p>
            </Step>

            <Step n={3} title="Tilt by sentiment (above a reach threshold)" formula="suggested = reach · (1 + strength · sentiment),  only when reach ≥ threshold">
              <p>
                Scraped text (news, Reddit, YouTube comments) is scored by an LLM from −1 to +1, and it scales the
                reach price up or down — <span className="font-mono">strength</span> sets how much (±25% at full
                ±1 by default). It&apos;s a proportional tilt, so a creator&apos;s sentiment stays proportional to
                their reach instead of a flat dollar amount swamping them.
              </p>
              <p className="text-xs text-zinc-500">
                Sentiment only applies <span className="text-zinc-200">once reach clears a configured threshold</span>{" "}
                (default $5) — a proxy for real presence. Below it, scraped text has no effect; with no reach at all,
                sentiment can&apos;t price the profile on its own. Sentiment <em>refines</em> an established price;
                it doesn&apos;t create one. (A news-relevant, no-socials figure is instead carried by Wikipedia
                pageviews, which is reach.)
              </p>
            </Step>

            <Step n={4} title="No hard cap — the top saturates" formula="price(f > 100k) = priceAt100k + k · ln(f / 100k),   k = 100k · slope">
              <p>
                Like an IPO, there&apos;s <span className="text-zinc-200">no ceiling</span> — a more valuable
                person should be able to price higher, and a hard cap would flatten the very top (everyone
                piling at the same number, losing the ranking that matters most). But the per-platform line is
                unbounded, so above the 100k anchor the curve <span className="text-zinc-200">saturates</span>:
                it continues as a logarithm tangent to the line at the anchor — diminishing returns. Growth
                never stops (300M still ranks above 100M), but it slows, so a mega-account lands in the tens of
                dollars, not the thousands. Because the join is smooth, prices at and below the anchor are
                unchanged (the ticket examples still hold exactly).
              </p>
              <p className="text-xs text-zinc-500">
                In practice this self-calibrates: a figure who is huge on all four platforms plus heavy
                Wikipedia coverage lands around <span className="font-mono text-zinc-300">$70</span> — right at
                the top of the real traded market — with no clamp doing the work. There is no max price at all;
                the curve shape, not a ceiling, keeps the top sane.
              </p>
              <p className="text-xs text-zinc-500">
                <span className="text-zinc-300">Toggle (<span className="font-mono">saturateTop</span>).</span> The
                &ldquo;Top of the curve&rdquo; switch controls this per config. <span className="text-zinc-200">On</span>{" "}
                (default) = the saturating curve above. <span className="text-zinc-200">Off</span> = pure linear
                extrapolation, unbounded — the same account climbs far higher ($996 vs. $14 at 50M followers). It
                recalculates instantly from data already entered, so you can compare the two without re-fetching.
              </p>
            </Step>

            <Step n={5} title="You set the final price" formula="final = whatever you type">
              <p>
                The suggestion pre-fills the final-price field, shown to four decimals. Edit it freely.
                Nothing is committed by the model — the human makes the call, which is what keeps a
                weak-but-useful signal from turning into a wrong price.
              </p>
            </Step>
          </div>
        </Section>

        <Section id="weights" title="Why these default weights">
          <p>
            Each platform&apos;s <span className="text-zinc-200">weight</span> encodes one judgment:{" "}
            <span className="text-zinc-200">how much a follower there is worth</span> to a person-trading index.
            That&apos;s the product of two things — <span className="text-zinc-200">how hard it is to reach 100k
            followers</span> on that platform (rarer = each follower means more) and the{" "}
            <span className="text-zinc-200">cultural / tradeable relevance</span> of that audience (mass influence
            vs. a niche one). The <span className="font-mono">price @ 100k</span> anchor carries part of this too;
            weight is the final multiplier.
          </p>
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800 bg-zinc-900">
                  <th className="px-3 py-2 font-medium">Platform</th>
                  <th className="px-3 py-2 font-medium">Reaching 100k</th>
                  <th className="px-3 py-2 font-medium">Cultural relevance</th>
                  <th className="px-3 py-2 font-medium text-right">Weight</th>
                </tr>
              </thead>
              <tbody className="text-zinc-400">
                <tr className="border-b border-zinc-800/60 align-top">
                  <td className="px-3 py-2 text-zinc-200">X</td>
                  <td className="px-3 py-2">Hard — but news/viral moments accelerate it</td>
                  <td className="px-3 py-2">Highest — real-time influence, drives the news cycle</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-400">1.35×</td>
                </tr>
                <tr className="border-b border-zinc-800/60 align-top">
                  <td className="px-3 py-2 text-zinc-200">YouTube</td>
                  <td className="px-3 py-2">Moderate — 100k is the Silver Play Button milestone</td>
                  <td className="px-3 py-2">High — deep engagement, monetized creators</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-400">1.25×</td>
                </tr>
                <tr className="border-b border-zinc-800/60 align-top">
                  <td className="px-3 py-2 text-zinc-200">Instagram</td>
                  <td className="px-3 py-2">Easier — visual virality, mass adoption</td>
                  <td className="px-3 py-2">High-mid — broad lifestyle reach, somewhat diluted</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-400">0.90×</td>
                </tr>
                <tr className="border-b border-zinc-800/60 align-top">
                  <td className="px-3 py-2 text-zinc-200">LinkedIn</td>
                  <td className="px-3 py-2">Hardest — no viral engine, professional audience; 100k is elite</td>
                  <td className="px-3 py-2">Lowest — professional / B2B, not mass-cultural</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-400">0.80×</td>
                </tr>
                <tr className="align-top">
                  <td className="px-3 py-2 text-zinc-200">TikTok</td>
                  <td className="px-3 py-2">Easiest — the algorithm pushes rapid follower growth</td>
                  <td className="px-3 py-2">Lower — younger, high churn, less per-follower value</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-400">0.50×</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500">
            <span className="text-zinc-300">LinkedIn is the paradox:</span> the hardest platform to reach 100k, yet
            the lowest cultural relevance for a celebrity index — the two forces offset to a moderate{" "}
            <span className="font-mono">0.80×</span>. <span className="text-zinc-300">TikTok</span> is the mirror
            image: easy to amass followers, lower tradeable value each, so <span className="font-mono">0.50×</span>.
            Instagram and TikTok also carry a slightly lower <span className="font-mono">price @ 100k</span>{" "}
            ($1.90 / $1.75) on top of their weight. These are the tuned <span className="text-zinc-200">v3</span>{" "}
            defaults — every one is an admin dial; set a weight to 0 to drop a platform entirely.
          </p>
        </Section>

        <Section id="spec" title="Exact spec — for reimplementation">
          <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 text-xs mb-1">
            <p className="text-zinc-400">
              The complete algorithm, matching <span className="font-mono text-zinc-300">src/lib/pricer.ts</span>{" "}
              exactly. All arithmetic is plain <span className="text-zinc-200">float64</span>; only the{" "}
              <em>display</em> is rounded (to 4 decimals). <span className="font-mono">ln</span> is the natural
              logarithm. Every constant below is an admin-tunable default, not a hardcoded value.
            </p>
          </div>

          <p className="text-xs text-zinc-500 pt-1">Default configuration</p>
          <pre className="font-mono text-xs text-emerald-400 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap">{`priceFloor             = 0.01      // $ at/below a signal's minimum
ANCHOR_FOLLOWERS       = 100000    // fixed anchor of the follower curve

rules = {                          // per platform (admin-tuned "v3" defaults)
  x:         { minFollowers: 500,  priceAt100k: 2.00, weight: 1.35 },
  instagram: { minFollowers: 500,  priceAt100k: 1.90, weight: 0.90 },
  tiktok:    { minFollowers: 500,  priceAt100k: 1.75, weight: 0.50 },
  youtube:   { minFollowers: 250,  priceAt100k: 2.00, weight: 1.25 },
  linkedin:  { minFollowers: 1000, priceAt100k: 2.00, weight: 0.80 },  // manual entry (no follower API)
}
wikipedia = { minViews: 5000, anchorViews: 100000, priceAtAnchor: 10.00, weight: 1.15 }

sentimentWeight        = 0.20      // ± tilt at full ±1 sentiment
sentimentMinReach      = 5.00      // sentiment applies only when reach >= this
wikipediaSocialDamping = 0.60      // d: how much socials discount Wikipedia (0..1)
saturateTop            = true      // true = diminishing returns above anchor; false = linear/unbounded`}</pre>

          <p className="text-xs text-zinc-500 pt-2">One signal → price (used for each platform and for Wikipedia)</p>
          <pre className="font-mono text-xs text-emerald-400 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap">{`// x = followers (platform)  or  30-day pageviews (Wikipedia)
function signalPrice(x, min, anchor, priceAtAnchor, floor, saturateTop) {
  if (!isFinite(x) || x <= min) return floor
  const denom = anchor - min
  if (denom <= 0) return floor                       // guard: min >= anchor
  const slope = (priceAtAnchor - floor) / denom      // $ per unit, below the anchor
  let p
  if (x <= anchor || !saturateTop) p = floor + slope * (x - min)        // linear (unbounded when off)
  else p = priceAtAnchor + (anchor * slope) * Math.log(x / anchor)      // saturating log
  return Math.max(floor, p)                          // floor only — NO hard cap in either mode
}

platformPrice(f, rule) = signalPrice(f, rule.minFollowers, 100000, rule.priceAt100k, floor, saturateTop)
wikipediaPrice(v)      = signalPrice(v, wiki.minViews, wiki.anchorViews, wiki.priceAtAnchor, floor, saturateTop)

// Above the anchor, k = anchor*slope makes the log tangent to the line at the
// anchor (C1-continuous): value AND slope match, so f <= anchor is untouched.`}</pre>

          <p className="text-xs text-zinc-500 pt-2">Combine → suggested price</p>
          <pre className="font-mono text-xs text-emerald-400 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap">{`// followers: { x, instagram, tiktok, youtube } → number | null
// wikiViews: number | null      sentiment: number in [-1,1] | null (unscored)
function suggestPrice(followers, wikiViews, sentiment) {
  // 1) Social reach — additive over platforms with real reach
  let socialSum = 0, anySocial = false
  for (const p of ['x','instagram','tiktok','youtube']) {
    const f = followers[p], rule = rules[p]
    const included = isFinite(f) && f > rule.minFollowers      // strictly above min
    if (included) {
      const c = Math.max(0, rule.weight) * platformPrice(f, rule)
      if (c > 0) { socialSum += c; anySocial = true }
    }
  }

  // 2) Wikipedia — additive, damped by existing social reach
  const wIncluded = isFinite(wikiViews) && wikiViews > wiki.minViews
  const wikiRaw = wIncluded ? Math.max(0, wiki.weight) * wikipediaPrice(wikiViews) : 0
  const d = clamp(wikipediaSocialDamping, 0, 1)
  const dampingFactor = wikiRaw > 0 ? (1 - d) + d / (1 + socialSum / wikiRaw) : 1
  const wikiContribution = wikiRaw * dampingFactor

  // 3) Reach = social + damped wiki   (null if nothing contributes)
  const anyReach = anySocial || wikiContribution > 0
  const reach = anyReach ? socialSum + wikiContribution : null

  // 4) Sentiment tilt — only once reach clears the threshold
  const s = (sentiment == null) ? 0 : clamp(sentiment, -1, 1)
  const applied = sentiment != null && reach != null && reach >= sentimentMinReach
  const multiplier = applied ? 1 + Math.max(0, sentimentWeight) * s : 1

  // 5) Final (floored, no ceiling). null → no signal, price manually.
  return reach == null ? null : Math.max(floor, reach * multiplier)
}`}</pre>

          <p className="text-xs text-zinc-500 pt-2">Worked examples (unit-test targets)</p>
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800 bg-zinc-900">
                  <th className="px-3 py-2 font-medium">Input</th>
                  <th className="px-3 py-2 font-medium">Key steps</th>
                  <th className="px-3 py-2 font-medium text-right">Result</th>
                </tr>
              </thead>
              <tbody className="text-zinc-400">
                <tr className="border-b border-zinc-800/60 align-top">
                  <td className="px-3 py-2">IG f=100,136<br/><span className="text-zinc-600">min 3000, @100k 1.50</span></td>
                  <td className="px-3 py-2 font-mono text-[11px]">above anchor: slope=1.49/97000, k=1.53608;<br/>1.50 + 1.53608·ln(1.00136)</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-400">$1.5021</td>
                </tr>
                <tr className="border-b border-zinc-800/60 align-top">
                  <td className="px-3 py-2">X f=12,009<br/><span className="text-zinc-600">min 200, @100k 4.00</span></td>
                  <td className="px-3 py-2 font-mono text-[11px]">linear: 0.01 + (3.99/99800)·11809</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-400">$0.4821</td>
                </tr>
                <tr className="border-b border-zinc-800/60 align-top">
                  <td className="px-3 py-2">Wiki v=1,900,000<br/><span className="text-zinc-600">@anchor 10.00, no socials</span></td>
                  <td className="px-3 py-2 font-mono text-[11px]">k=10.19388; 10 + 10.19388·ln(19);<br/>dampingFactor = 1.00</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-400">$40.0153</td>
                </tr>
                <tr className="border-b border-zinc-800/60 align-top">
                  <td className="px-3 py-2">socials $19.58<br/>+ wikiRaw $40.54, d=0.6</td>
                  <td className="px-3 py-2 font-mono text-[11px]">damping = 0.4 + 0.6/(1 + 19.58/40.54) = 0.805;<br/>wiki adds 40.54·0.805 = 32.62</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-400">reach $52.20</td>
                </tr>
                <tr className="align-top">
                  <td className="px-3 py-2">reach $52.20<br/>sentiment +0.4</td>
                  <td className="px-3 py-2 font-mono text-[11px]">≥ $5 → ×(1 + 0.25·0.4) = ×1.10</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-400">$57.42</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-zinc-500 pt-2">
            <span className="text-zinc-300">Edge cases:</span> no platform above its min AND Wikipedia below{" "}
            <span className="font-mono">minViews</span> → <span className="font-mono">reach = null</span> →{" "}
            <span className="font-mono">suggested = null</span> (UI shows &ldquo;set manually&rdquo;). Sentiment with
            reach below <span className="font-mono">sentimentMinReach</span> (or null reach) → no tilt.{" "}
            <span className="font-mono">weight 0</span> → that signal drops out. <span className="font-mono">d = 0</span>{" "}
            → Wikipedia is pure-additive (no discount). There is no upper bound on the output.
          </p>
        </Section>

        <Section id="params" title="Every setting, explained">
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800 bg-zinc-900">
                  <th className="px-3 py-2 font-medium">Setting</th>
                  <th className="px-3 py-2 font-medium">What it does</th>
                </tr>
              </thead>
              <tbody>
                <Param name="Min followers">
                  Per platform, the <span className="text-zinc-200">inclusion threshold</span>: at or below it a
                  profile floors at $0.01 and is excluded from reach. The defaults sit <span className="text-zinc-200">slightly
                  above each platform&apos;s average user</span> (X 500, Instagram 500, TikTok 500, YouTube 250,
                  LinkedIn 1000), so an ordinary account doesn&apos;t earn a real price — you need above-average
                  reach to clear the bar. YouTube&apos;s is lower because subscribers are rarer/harder to earn than
                  a follow; LinkedIn&apos;s is higher because the average user already has ~900 connections.
                </Param>
                <Param name="Price @ 100k">
                  Per platform. The suggested price for exactly 100,000 followers — the anchor that sets the
                  slope of the whole line. This is where an admin encodes judgment about how much a platform&apos;s
                  audience is worth (default $2.00).
                </Param>
                <Param name="Weight">
                  Per platform, a <span className="text-zinc-200">multiplier</span> on how much that platform&apos;s
                  price adds to reach. <span className="font-mono">1×</span> = full ticket price; <span className="font-mono">0.5×</span>
                  = half; <span className="font-mono">0×</span> = ignore it. They&apos;re independent (not shares of
                  a total), because reach is a sum — that&apos;s what makes adding a platform always add.
                </Param>
                <Param name="Price floor">
                  The flat price for anyone below a platform&apos;s minimum. The ticket uses $0.01.
                </Param>
                <Param name="Sentiment strength">
                  How hard sentiment tilts the reach price: at <span className="font-mono">0.20</span> (the v3
                  default), fully positive news is <span className="font-mono">+20%</span> and fully negative{" "}
                  <span className="font-mono">−20%</span>. Set it to 0 to price purely on reach. It only applies
                  once reach clears the threshold — sentiment refines a price, it doesn&apos;t create one.
                </Param>
                <Param name="Applies above reach">
                  The reach threshold (<span className="font-mono">$5</span> default) sentiment must clear before it
                  tilts at all — a proxy for real presence. Below it, or with no reach, scraped text is ignored.
                </Param>
                <Param name="Discount if they have socials">
                  How much existing social reach discounts the Wikipedia contribution (<span className="font-mono">0.60</span>{" "}
                  default). 0 = pure additive; higher = a heavily-followed person&apos;s Wikipedia counts for less
                  (its fame is already in their followers). A no-socials figure&apos;s Wikipedia always counts fully.
                </Param>
                <Param name="Top of the curve">
                  Soft cap <span className="font-mono">on</span> (default) = diminishing returns above 100k;{" "}
                  <span className="font-mono">off</span> = pure linear, unbounded. No hard $ ceiling either way.
                </Param>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500 pt-2">
            The config is saved to your browser automatically, so any tweaks persist between visits. The deployed
            app ships with the tuned <span className="text-zinc-300">v3</span> model as its baked-in default;{" "}
            <span className="text-zinc-200">Reset</span> returns to it at any time.
          </p>
        </Section>

        <Section id="nosocials" title="People without socials">
          <p>
            A follower-based pricer is blind to anyone whose relevance isn&apos;t on social media — figures
            famous through news, politics, or notoriety rather than posting. When no platform has followers
            above its minimum, there is <span className="text-zinc-200">no honest follower suggestion</span>, so
            the tool says so plainly (&ldquo;No reach data — set price manually&rdquo;) instead of showing a
            misleading $0.01.
          </p>
          <p>
            For these profiles, use the <span className="text-zinc-200">Price like…</span> picker to start from
            a comparable already listed on pauv — price a new director near other directors, a new politician
            near other politicians — then adjust. It fills the final-price field from that comparable&apos;s
            live NPSI, and you take it from there.
          </p>
          <p className="text-xs text-zinc-500">
            <span className="text-zinc-300">This gap is now largely closed by Wikipedia pageviews</span> (below) —
            a real magnitude signal for news-famous figures. Christopher Nolan has almost no social following but
            ~1.9M Wikipedia views / 30 days, which prices him around $39 on its own — close to his live pauv
            price. The comparable picker remains a backstop for anyone with neither socials nor a Wikipedia article.
          </p>
        </Section>

        <Section id="wikipedia" title="Wikipedia pageviews — a volume signal">
          <p>
            Followers measure <em>audience</em>; Wikipedia pageviews measure <span className="text-zinc-200">how
            much the world reads about someone</span> — a coverage-volume magnitude that doesn&apos;t depend on
            them posting. It&apos;s wired as its own <span className="text-zinc-200">weighted reach component</span>,
            alongside the platforms.
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-sm">
            <li><span className="font-mono text-xs">/api/wikipedia</span> resolves the person&apos;s article (following redirects) and sums the <span className="text-zinc-200">last 30 days</span> of pageviews — free Wikimedia APIs, no key.</li>
            <li>Those views map to a price (floor below the minimum, rising to your configured price at 100k views, then <span className="text-zinc-200">saturating</span>), then <span className="text-zinc-200">add into reach</span> by their weight — so Wikipedia can only raise the price, never lower it. Because it&apos;s the sole signal for no-socials figures, a pageview is anchored richer than a follower.</li>
            <li>Below the minimum, or no article, contributes nothing (excluded, not penalized).</li>
          </ul>
          <p className="text-xs text-zinc-500">
            <span className="text-zinc-300">Discounted when they already have socials.</span> Followers and
            Wikipedia both measure the same underlying fame, so counting both in full double-counts. Wikipedia&apos;s
            contribution is discounted by how much social reach already exists — none for a no-socials figure (it
            counts fully), up to <span className="font-mono">d</span> off (default 60%) as social reach dwarfs the
            raw Wikipedia value. The <span className="text-zinc-200">Discount if they have socials</span> knob{" "}
            <span className="font-mono">d</span> (0 = pure additive) controls the strength.
          </p>
          <pre className="font-mono text-xs text-emerald-400 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap">{`wikiRaw       = weight_wiki · wikipediaPrice(v)
socialReach   = Σ included platforms (weightₚ · platformPrice(fₚ))
dampingFactor = (1 - d) + d / (1 + socialReach / wikiRaw)     // = 1 when socialReach = 0

wikiContribution = wikiRaw · dampingFactor`}</pre>
          <p className="text-xs text-zinc-500">
            This is the magnitude piece follower reach and sentiment tone can&apos;t provide — and it&apos;s what
            lets a no-socials, news-relevant figure get a real number instead of deferring to a comparable.
          </p>
        </Section>

        <Section id="data" title="Follower data & APIs">
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>
              <span className="text-zinc-200 font-medium">Four of five platforms have follower-lookup APIs.</span>{" "}
              <span className="font-mono text-xs">/api/x-followers</span>,{" "}
              <span className="font-mono text-xs">/api/instagram-followers</span>, and{" "}
              <span className="font-mono text-xs">/api/tiktok-followers</span> all go through{" "}
              <span className="text-zinc-200">Apify</span> (pay-per-use);{" "}
              <span className="font-mono text-xs">/api/youtube-followers</span> uses the{" "}
              <span className="text-zinc-200">YouTube Data API</span>. Paste a handle, click Fetch, get the count.
              All run <span className="text-zinc-200">server-side only</span> — keys never reach the browser,
              never <span className="font-mono text-xs">NEXT_PUBLIC_</span>.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">LinkedIn is manual-entry (optional).</span> There&apos;s
              no usable public follower API (LinkedIn blocks scraping and has no open API), so you type the count
              in — leave it blank to skip it. Its default weight is <span className="font-mono">0.80×</span>:
              LinkedIn is the <em>hardest</em> platform to reach 100k followers (no viral engine, a professional
              audience), but a LinkedIn following is <em>lower</em> cultural/tradeable relevance for a person-index
              than X/YouTube — those two forces offset to a moderate weight. Set the weight to 0 to ignore it
              entirely.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Mock-first.</span> Until each key is set in{" "}
              <span className="font-mono text-xs">.env.local</span> the Fetch button returns a clear
              &ldquo;configure key&rdquo; message and you enter the count by hand — no code change to go live.
              Keys: <span className="font-mono text-xs">APIFY_API_TOKEN</span> (X + Instagram + TikTok) and{" "}
              <span className="font-mono text-xs">YOUTUBE_API_KEY</span>.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Cost note.</span> YouTube Data API is{" "}
              <span className="text-zinc-200">free</span> within a 10,000-unit/day quota (1 unit per follower
              lookup). X, Instagram, and TikTok go through <span className="text-zinc-200">Apify</span>{" "}
              (usage-billed, cents per lookup) — none has a usable free follower API. <span className="text-zinc-300">X
              used to run on the official X API v2, which costs $200–$5,000/month for a follower count; routing it
              through Apify removes that recurring cost</span> (the official implementation is preserved in git
              history). At the ~10k-listing scale, Apify is the dominant cost; the LLM is ~$40, everything else free.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Reddit is a sentiment source, not reach.</span>{" "}
              Follower counts aren&apos;t meaningful on Reddit, so it doesn&apos;t get a follower price — its
              discussion feeds the sentiment text alongside news and X.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Three sentiment sources, merged.</span>{" "}
              <span className="font-mono text-xs">/api/news</span> pulls and dedupes:{" "}
              <span className="text-zinc-200">Google News RSS</span> (press, free),{" "}
              <span className="text-zinc-200">Reddit search</span> (social discussion, free), and{" "}
              <span className="text-zinc-200">YouTube comments</span> (public reaction on videos about the person).
              The <span className="text-zinc-200">Fetch news</span> button fills the sentiment box; any source
              failing degrades gracefully to the others.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">What&apos;s NOT scraped.</span> No LinkedIn (no public
              content API + ToS/anti-scraping — deliberately skipped), no X posts, no TikTok/Instagram captions.
              The X / follower APIs fetch follower <em>counts</em>, not posts — only news, Reddit, and YouTube
              comments feed sentiment.
            </li>
          </ul>
          <p className="text-xs text-zinc-500 pt-1">
            Reddit&apos;s public JSON often rate-limits server IPs without OAuth — it then degrades to the other
            sources (<span className="font-mono">reddit unavailable</span>). <span className="text-zinc-300">YouTube
            comments are opt-in via <span className="font-mono">YOUTUBE_API_KEY</span> and cost quota:</span> finding
            videos uses <span className="font-mono">search.list</span> (100 units) plus a comments call per video
            (1 unit each), so ~100+ units per lookup — vs 1 unit for a YouTube follower lookup. That&apos;s the
            YouTube cost driver at scale (the 10k/day default quota ≈ ~100 comment-lookups/day; request a quota
            increase for more).
          </p>
        </Section>

        <Section id="sentiment-accuracy" title="Sentiment scoring (LLM, entity-targeted)">
          <p>
            Sentiment is scored by an <span className="text-zinc-200 font-medium">entity-targeted LLM</span> — the
            only engine (a word-list scorer like VADER can&apos;t do the three things that matter for a per-person
            index: it has no world knowledge (&ldquo;indicted&rdquo; = bad), no entity targeting
            (&ldquo;Trump slams Biden&rdquo; — negative for <em>whom</em>?), and misses sarcasm/slang).
          </p>
          <p>
            <span className="font-mono text-xs">/api/sentiment-llm</span> sends the scraped items to{" "}
            <span className="font-mono text-xs">claude-haiku-4-5</span> and asks it to rate each one&apos;s
            sentiment <span className="text-zinc-200">toward the named person</span> (−1…+1 with a one-line
            reason, structured output). Incidental mentions score ~0; world-knowledge cues land right. It&apos;s
            cheap and fast — all of a person&apos;s items score in one call, and it runs automatically when you
            Fetch news; the per-item breakdown shows underneath. Needs an LLM key server-side (until then
            sentiment stays neutral and the price is reach-only).
          </p>
          <p className="text-xs text-zinc-500">
            <span className="text-zinc-300">Deterministic.</span> Scoring runs at{" "}
            <span className="font-mono">temperature 0</span> with a fixed seed, so the <em>same</em> headlines
            always produce the <em>same</em> score — the price won&apos;t drift between runs. It moves only when
            the underlying news genuinely changes (a new article published), which is real signal, not noise.
          </p>
          <p className="text-xs text-zinc-500">
            <span className="text-zinc-300">Provider-switchable via env, no code change.</span> Anthropic is the
            default; set <span className="font-mono">SENTIMENT_PROVIDER=deepseek</span> (or{" "}
            <span className="font-mono">openai</span> / <span className="font-mono">openai-compatible</span>) with{" "}
            <span className="font-mono">SENTIMENT_API_KEY</span> to switch — everything talks to the{" "}
            <span className="font-mono">/api/sentiment-llm</span> route, so the model swap never touches the UI or
            pricing. For this task the provider choice barely moves results (entity-targeting is the win); flip it
            in prod and A/B if you want.
          </p>
        </Section>

        <Section id="discover" title="Auto-discovery (the in-app agent)">
          <p>
            <span className="font-mono text-xs">/api/discover</span> resolves follower counts autonomously by
            driving a <span className="text-zinc-200">real Chromium</span> (Playwright) that stays logged into your
            accounts and runs on <span className="text-zinc-200">this machine&apos;s IP</span>. Given a handle or
            URL it opens the profile, reads the count from the page, and — if that fails — screenshots it and a
            vision model reads the number off the image. Given a <em>name</em>, it searches each platform to resolve
            the handle first (X name-search needs you logged into X; otherwise it&apos;s skipped, not guessed).
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-sm">
            <li><span className="text-zinc-200">TikTok</span> — <span className="font-mono">followerCount</span> from the page JSON (no login needed).</li>
            <li><span className="text-zinc-200">Instagram</span> — the follower count from the profile meta (needs you logged in), name→handle via IG search.</li>
            <li><span className="text-zinc-200">X</span> — intercepts the profile&apos;s own API response for the exact count.</li>
            <li><span className="text-zinc-200">YouTube</span> — the official Data API (no browser, exact subscriber count); a name does a channel search first. Needs <span className="font-mono">YOUTUBE_API_KEY</span>.</li>
            <li><span className="text-zinc-200">Vision fallback</span> — a screenshot read by a multimodal model (Gemini free tier) when parsing misses.</li>
          </ul>
          <p className="text-xs text-zinc-500">
            <span className="text-zinc-300">Why it runs locally.</span> The platforms block datacenter IPs (Vercel,
            AWS…) behind login walls — so discovery only works where the server has a <span className="text-zinc-200">residential
            IP + your logged-in browser profile</span>: your own machine, or the box behind{" "}
            <span className="font-mono">price.pauv.com</span>. Set it up once:
          </p>
          <pre className="font-mono text-xs text-emerald-400 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap">{`npm run pw:install     # download Chromium (first time)
npm run pw:login       # log into IG / X / TikTok once — session persists
npm run dev            # the "Discover" button now resolves counts`}</pre>
          <p className="text-xs text-zinc-500">
            These are unofficial page shapes and will drift over time — expect the occasional one-line fix
            (a selector, or the X query id). It automates public lookups you could do by hand; keep it internal
            and mind each platform&apos;s ToS.
          </p>
        </Section>

        <Section id="integration" title="Connecting the PAUV website">
          <p>
            When someone lists themselves on PAUV, the site gets a suggested initial price by calling one endpoint
            on this pricer — <span className="font-mono text-xs">POST /api/price</span>. Give it a name and/or
            handles; it auto-discovers followers (unless you pass them), runs the v3 model, and returns the price.
          </p>
          <pre className="font-mono text-xs text-emerald-400 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap">{`POST https://price.pauv.com/api/price
  x-pauv-secret: <shared secret>
  { "name": "Ava Nakamura",
    "handles": { "instagram": "avanakamura", "tiktok": "avanakamura" },
    "wikipediaViews": 0 }

→ { "suggested": 3.42, "reachPrice": 3.42, "hasSignal": true,
    "followers": { "instagram": 3900000, "tiktok": 8400000, ... },
    "perPlatform": [ ... ] }`}</pre>
          <p className="text-xs text-zinc-500">
            <span className="text-zinc-300">How the connection works.</span> Because discovery must run on a
            residential IP, the pricer lives on your own machine — and a <span className="text-zinc-200">Cloudflare
            Tunnel</span> (free) exposes that local server at a stable HTTPS domain,{" "}
            <span className="font-mono">price.pauv.com</span>, with no open ports or public IP. PAUV&apos;s backend
            then calls it <span className="text-zinc-200">server-to-server</span> (no CORS, no browser) with a
            shared <span className="font-mono">x-pauv-secret</span> so only PAUV can reach it. It&apos;s a single
            authenticated HTTP call — about as simple as an integration gets.
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-xs text-zinc-500">
            <li>Run the pricer locally, then <span className="font-mono">cloudflared tunnel --url http://localhost:3001</span> (or a named tunnel bound to <span className="font-mono">price.pauv.com</span>).</li>
            <li>Set <span className="font-mono">PRICE_API_SECRET</span> here and on PAUV&apos;s caller; keep the machine + browser logged in.</li>
            <li>Prefer server-to-server; if the browser must call directly, set <span className="font-mono">PRICE_ALLOWED_ORIGIN</span> to the PAUV origin.</li>
          </ul>
        </Section>

        <div className="pt-4 border-t border-zinc-800">
          <Link href="/" className="text-sm text-violet-400 hover:text-violet-300 transition-colors">← Back to the pricer</Link>
        </div>
      </main>
    </div>
  );
}
