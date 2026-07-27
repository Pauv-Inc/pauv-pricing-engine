"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import InfoTooltip from "@/components/InfoTooltip";
import { SEED_PROFILES, type ExampleProfile } from "@/lib/seed";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  API_PLATFORMS,
  FOLLOWER_ROUTES,
  SENTIMENT_SOURCES,
  type Platform,
  type PricerConfig,
} from "@/lib/types";
import { computeSuggestion, defaultConfig, fmtPrice } from "@/lib/pricer";

// v8: VADER removed (LLM is the only sentiment engine).
const CONFIG_KEY = "pauv_pricer_config_v14";
const TEMPLATES_KEY = "pauv_pricer_templates_v1";

function fmtInt(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toLocaleString("en-US");
}

type FollowerMap = Record<Platform, number | null>;
type HandleMap = Record<Platform, string>;

function emptyFollowers(): FollowerMap {
  return { x: null, instagram: null, tiktok: null, youtube: null };
}
function emptyHandles(): HandleMap {
  return { x: "", instagram: "", tiktok: "", youtube: "" };
}

// Defensively merge a stored/loaded config onto the current defaults so a
// missing or partial field can't crash the pricer.
function mergeConfig(parsed: unknown): PricerConfig {
  const base = defaultConfig();
  const p = (parsed ?? {}) as Partial<PricerConfig> & { rules?: Record<string, unknown> };
  const rules = { ...base.rules };
  for (const plat of PLATFORMS) {
    const r = p.rules?.[plat];
    if (r) rules[plat] = { ...base.rules[plat], ...(r as object) };
  }
  return { ...base, ...(p as object), rules, wikipedia: { ...base.wikipedia, ...(p.wikipedia ?? {}) } };
}

export default function PricerPage() {
  const [cfg, setCfg] = useState<PricerConfig>(defaultConfig());
  const [loaded, setLoaded] = useState(false);

  // Saved config "models" — named PricerConfig snapshots you can reload.
  const [templates, setTemplates] = useState<Record<string, PricerConfig>>({});
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  // Application state (the person being added).
  const [name, setName] = useState("");
  const [handles, setHandles] = useState<HandleMap>(emptyHandles);
  const [followers, setFollowers] = useState<FollowerMap>(emptyFollowers);
  const [sentimentText, setSentimentText] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  const [finalEdited, setFinalEdited] = useState(false);
  const [refPrice, setRefPrice] = useState<number | null>(null);
  const [fetchMsg, setFetchMsg] = useState<Record<Platform, string>>({
    x: "", instagram: "", tiktok: "", youtube: "",
  });

  // LLM (entity-targeted) sentiment: overall score + per-item breakdown. Set by
  // Fetch news; cleared when the text changes (stale). Drives the sentiment tilt.
  const [llm, setLlm] = useState<{ overall: number; scores: { text: string; score: number; reason: string }[] } | null>(null);
  const [llmMsg, setLlmMsg] = useState("");

  // Wikipedia pageviews (30-day) — a coverage-volume reach component.
  const [wikiViews, setWikiViews] = useState<number | null>(null);
  const [wikiTitle, setWikiTitle] = useState("");
  const [wikiMsg, setWikiMsg] = useState("");

  // ---- Load / persist config + templates ----
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) setCfg(mergeConfig(JSON.parse(raw)));
      const t = localStorage.getItem(TEMPLATES_KEY);
      if (t) setTemplates(JSON.parse(t));
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
  }, [cfg, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates)); } catch { /* ignore */ }
  }, [templates, loaded]);

  // Save the current config as a named model; load / delete saved ones.
  const saveTemplate = useCallback(() => {
    const nm = (templateName.trim() || selectedTemplate).trim();
    if (!nm) return;
    setTemplates((t) => ({ ...t, [nm]: cfg }));
    setSelectedTemplate(nm);
    setTemplateName("");
  }, [templateName, selectedTemplate, cfg]);

  const loadTemplate = useCallback((nm: string) => {
    setSelectedTemplate(nm);
    setTemplates((t) => {
      if (t[nm]) setCfg(mergeConfig(t[nm]));
      return t;
    });
  }, []);

  const deleteTemplate = useCallback(() => {
    if (!selectedTemplate) return;
    setTemplates((t) => {
      const next = { ...t };
      delete next[selectedTemplate];
      return next;
    });
    setSelectedTemplate("");
  }, [selectedTemplate]);

  const result = useMemo(
    () => computeSuggestion(followers, cfg, llm?.overall ?? null, wikiViews),
    [followers, cfg, llm, wikiViews]
  );

  // The LLM score is tied to the exact text that produced it — clear it when the
  // text changes so a stale score can't linger.
  useEffect(() => {
    setLlm(null);
    setLlmMsg("");
  }, [sentimentText]);

  // Existing pauv listings, priced, for the "price like…" comparable picker.
  const comparables = useMemo(
    () => SEED_PROFILES.filter((p) => p.marketNPSI != null)
      .sort((a, b) => (b.marketNPSI as number) - (a.marketNPSI as number)),
    []
  );

  // Keep the final-price field synced to the suggestion until the user edits it.
  // With no usable reach there's no honest suggestion, so leave it blank.
  useEffect(() => {
    if (finalEdited) return;
    if (!result.hasSignal) { setFinalPrice(""); return; }
    setFinalPrice(result.suggested != null ? result.suggested.toFixed(4) : "");
  }, [result.suggested, result.hasSignal, finalEdited]);

  const setRule = (plat: Platform, key: "minFollowers" | "priceAt100k", v: number) =>
    setCfg((c) => ({ ...c, rules: { ...c.rules, [plat]: { ...c.rules[plat], [key]: v } } }));

  // Weights are independent multipliers now (no rebalancing) — a platform's
  // weight scales how much its price adds to reach; sentiment's is tilt strength.
  const setPlatformWeight = (plat: Platform, v: number) =>
    setCfg((c) => ({ ...c, rules: { ...c.rules, [plat]: { ...c.rules[plat], weight: Math.max(0, v) } } }));
  const setSentimentWeight = (v: number) =>
    setCfg((c) => ({ ...c, sentimentWeight: Math.max(0, v) }));

  const loadExample = useCallback((p: ExampleProfile) => {
    setName(p.name);
    setFollowers({ ...p.followers });
    setHandles({
      x: p.name.replace(/\s+/g, "").toLowerCase(),
      instagram: p.name.replace(/\s+/g, "").toLowerCase(),
      tiktok: "", youtube: "",
    });
    setSentimentText(p.snippets.join("\n"));
    setRefPrice(p.marketNPSI);
    setFinalEdited(false);
    setFetchMsg({ x: "", instagram: "", tiktok: "", youtube: "" });
    setWikiViews(null); setWikiTitle(""); setWikiMsg("");
  }, []);

  // Wikipedia weight/rule setters.
  const setWikiRule = (key: "minViews" | "priceAtAnchor", v: number) =>
    setCfg((c) => ({ ...c, wikipedia: { ...c.wikipedia, [key]: v } }));
  const setWikiWeight = (v: number) =>
    setCfg((c) => ({ ...c, wikipedia: { ...c.wikipedia, weight: Math.max(0, v) } }));

  const clearAll = useCallback(() => {
    setName("");
    setHandles(emptyHandles());
    setFollowers(emptyFollowers());
    setSentimentText("");
    setRefPrice(null);
    setFinalEdited(false);
    setFinalPrice("");
    setFetchMsg({ x: "", instagram: "", tiktok: "", youtube: "" });
    setWikiViews(null); setWikiTitle(""); setWikiMsg("");
  }, []);

  // Attempt a live follower fetch (works once tokens are configured server-side;
  // otherwise the route returns a clear "configure token" message).
  const fetchFollowers = useCallback(async (plat: Platform) => {
    const handle = handles[plat].trim();
    if (!handle) { setFetchMsg((m) => ({ ...m, [plat]: "Enter a handle first" })); return; }
    setFetchMsg((m) => ({ ...m, [plat]: "Fetching…" }));
    try {
      const resp = await fetch(`${FOLLOWER_ROUTES[plat]}?username=${encodeURIComponent(handle)}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
      setFollowers((f) => ({ ...f, [plat]: data.followersCount }));
      setFetchMsg((m) => ({ ...m, [plat]: `Live: ${fmtInt(data.followersCount)}` }));
    } catch (e) {
      setFetchMsg((m) => ({ ...m, [plat]: e instanceof Error ? e.message : "Fetch failed — enter manually" }));
    }
  }, [handles]);

  // Pull live news headlines for the entered name and drop them into the
  // sentiment box — the first real scraper for the sentiment signal.
  const [newsMsg, setNewsMsg] = useState("");

  // Score items with the entity-targeted LLM. Called with the freshly-scraped
  // texts (so it doesn't wait on async state).
  const scoreLLM = useCallback(async (person: string, texts: string[]) => {
    if (!person || !texts.length) return;
    setLlmMsg("Scoring toward " + person + "…");
    try {
      const resp = await fetch("/api/sentiment-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: person, texts }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
      setLlm({ overall: data.overall, scores: data.scores || [] });
      setLlmMsg(`Scored ${data.scores?.length ?? 0} items toward ${person} (${data.provider}/${data.model})`);
    } catch (e) {
      setLlmMsg(e instanceof Error ? e.message : "LLM scoring failed");
    }
  }, []);

  // Fetch scraped text (news + Reddit) for the name and score it — one button.
  // When the LLM engine is selected, scoring runs automatically on the results.
  const fetchNews = useCallback(async () => {
    const person = name.trim();
    if (!person) { setNewsMsg("Enter a name first"); return; }
    setNewsMsg("Fetching news…");
    try {
      const resp = await fetch(`/api/news?name=${encodeURIComponent(person)}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
      const titles: string[] = (data.headlines || []).map((h: { title: string }) => h.title);
      if (!titles.length) { setNewsMsg("No recent items found"); return; }
      setSentimentText(titles.join("\n"));
      const s = data.sources || {};
      setNewsMsg(`Pulled ${titles.length} items · ${s.news ?? 0} news + ${s.reddit ?? 0} reddit + ${s.youtube ?? 0} yt comments${s.redditError ? " (reddit unavailable)" : ""}`);
      await scoreLLM(person, titles);
    } catch (e) {
      setNewsMsg(e instanceof Error ? e.message : "News fetch failed");
    }
  }, [name, scoreLLM]);

  // Resolve the person's Wikipedia article and pull 30-day pageviews.
  const fetchWikipedia = useCallback(async () => {
    const person = name.trim();
    if (!person) { setWikiMsg("Enter a name first"); return; }
    setWikiMsg("Looking up Wikipedia…");
    try {
      const resp = await fetch(`/api/wikipedia?name=${encodeURIComponent(person)}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
      if (!data.exists) { setWikiViews(0); setWikiTitle(""); setWikiMsg("No Wikipedia article found"); return; }
      setWikiViews(data.views30d);
      setWikiTitle(data.title);
      setWikiMsg(`${data.title} · ${Number(data.views30d).toLocaleString()} views / 30d${data.stale ? " (cached — upstream slow)" : ""}`);
    } catch (e) {
      setWikiMsg(e instanceof Error ? e.message : "Wikipedia fetch failed");
    }
  }, [name]);

  // One-click: fetch every available signal for this person concurrently —
  // followers for each platform with a handle, Wikipedia pageviews, and news
  // (which auto-scores sentiment). Each sub-fetch owns its own status message.
  const [fetchingAll, setFetchingAll] = useState(false);
  const fetchAll = useCallback(async () => {
    const jobs: Promise<unknown>[] = [];
    for (const plat of PLATFORMS) {
      if (handles[plat].trim()) jobs.push(fetchFollowers(plat));
    }
    if (name.trim()) {
      jobs.push(fetchWikipedia());
      jobs.push(fetchNews());
    }
    if (!jobs.length) return;
    setFetchingAll(true);
    try {
      await Promise.allSettled(jobs);
    } finally {
      setFetchingAll(false);
    }
  }, [name, handles, fetchFollowers, fetchWikipedia, fetchNews]);

  if (!loaded) {
    return (
      <div className="h-screen bg-zinc-950 text-zinc-500 flex items-center justify-center">Loading…</div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold tracking-tight">
            <a href="https://docs.pauv.com/what-is-pauv" target="_blank" rel="noopener noreferrer"
               className="hover:text-violet-400 transition-colors">
              PAUV Pricer
            </a>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Reference pricing for a new listing &nbsp;|&nbsp; per-platform follower anchors &nbsp;&rarr;&nbsp; weighted &amp; sentiment-tilted suggestion &nbsp;&rarr;&nbsp; you set the final price
          </p>
        </div>
        <a href="/docs" className="rounded-md border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors">
          Docs
        </a>
      </header>

      <main className="px-6 py-6 grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6 items-start">
        {/* ---------------- PRICER CONFIG ---------------- */}
        <div className="space-y-4">
          <section className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-200">
                Pricer Config
                <InfoTooltip text="Admin settings. For each platform, set the follower floor and the price at 100,000 followers. The reference price is a straight line between them. Saved to this browser automatically." />
              </h2>
              <button onClick={() => setCfg(defaultConfig())}
                className="text-[11px] rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 text-zinc-400 transition-colors">
                Reset
              </button>
            </div>

            {/* Saved models — reusable config presets */}
            <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-950/40 p-2.5">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500 mb-1.5">
                Saved models
                <InfoTooltip text="Save the whole config (all platform anchors, weights, Wikipedia, sentiment, floor) as a named model, then reload it any time — no re-adjusting. Stored in this browser." />
              </div>
              <div className="flex gap-1 mb-1">
                <select
                  value={selectedTemplate}
                  onChange={(e) => { if (e.target.value) loadTemplate(e.target.value); else setSelectedTemplate(""); }}
                  className="flex-1 min-w-0 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="">{Object.keys(templates).length ? "Load a saved model…" : "No saved models yet"}</option>
                  {Object.keys(templates).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <button onClick={deleteTemplate} disabled={!selectedTemplate}
                  className="shrink-0 text-[11px] rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 px-2 py-1 text-zinc-400 transition-colors"
                  title="Delete the selected model">
                  ✕
                </button>
              </div>
              <div className="flex gap-1">
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveTemplate(); }}
                  placeholder={selectedTemplate ? `Overwrite “${selectedTemplate}” or name a new one` : "Name this model"}
                  className="flex-1 min-w-0 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <button onClick={saveTemplate}
                  className="shrink-0 text-[11px] rounded border border-violet-600/50 bg-violet-600/20 hover:bg-violet-600/30 px-3 py-1 text-violet-200 transition-colors">
                  Save
                </button>
              </div>
            </div>

            <div className="mb-4 flex gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Price floor ($)
                  <InfoTooltip text="The flat price for anyone at or below a platform's minimum followers. The ticket uses $0.01." />
                </label>
                <input
                  type="number" step="0.01" min="0" value={cfg.priceFloor}
                  onChange={(e) => setCfg((c) => ({ ...c, priceFloor: parseFloat(e.target.value) || 0 }))}
                  className="w-28 rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-xs text-zinc-400 mb-1">
                  Top of the curve
                  <InfoTooltip text="Controls the shape ABOVE 100k followers/views, and recalculates instantly from what you've already entered — no re-fetching. Soft cap ON (default): growth slows (diminishing returns), so mega-accounts stay tame. OFF: price keeps climbing at full slope (pure linear, unbounded), so the biggest price much higher. There is no hard $ ceiling in either mode." />
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={cfg.saturateTop}
                  onClick={() => setCfg((c) => ({ ...c, saturateTop: !c.saturateTop }))}
                  className="mt-0.5 inline-flex items-center gap-2 group"
                >
                  <span className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${cfg.saturateTop ? "bg-violet-600" : "bg-zinc-600"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${cfg.saturateTop ? "left-4.5" : "left-0.5"}`} style={{ left: cfg.saturateTop ? "1.125rem" : "0.125rem" }} />
                  </span>
                  <span className="text-xs text-zinc-300">
                    {cfg.saturateTop ? "Soft cap ON" : "Soft cap OFF"}
                    <span className="text-zinc-500"> · {cfg.saturateTop ? "saturating" : "linear"}</span>
                  </span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {PLATFORMS.map((plat) => (
                <div key={plat} className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-zinc-200">{PLATFORM_LABELS[plat]}</span>
                    {API_PLATFORMS[plat] ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400 uppercase tracking-wide">API</span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 uppercase tracking-wide">Manual</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] text-zinc-500">
                      Min followers
                      <input type="number" min="0" value={cfg.rules[plat].minFollowers}
                        onChange={(e) => setRule(plat, "minFollowers", parseInt(e.target.value) || 0)}
                        className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                    </label>
                    <label className="text-[10px] text-zinc-500">
                      Price @ 100k ($)
                      <input type="number" min="0" step="0.01" value={cfg.rules[plat].priceAt100k}
                        onChange={(e) => setRule(plat, "priceAt100k", parseFloat(e.target.value) || 0)}
                        className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                    </label>
                  </div>
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5">
                      <span>Weight (× contribution)</span>
                      <span className="font-mono text-zinc-300">{cfg.rules[plat].weight.toFixed(2)}×</span>
                    </div>
                    <input type="range" min="0" max="1.5" step="0.05" value={cfg.rules[plat].weight}
                      onChange={(e) => setPlatformWeight(plat, parseFloat(e.target.value))}
                      className="w-full" />
                  </div>
                </div>
              ))}

              {/* Wikipedia pageviews — a coverage-volume reach component */}
              <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-zinc-200">Wikipedia</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-900/40 text-sky-300 uppercase tracking-wide">volume</span>
                  <InfoTooltip text="30-day Wikipedia pageviews as a magnitude signal — how much the world reads about this person. Adds to reach like a platform. Especially valuable for news-famous figures with little social following." />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] text-zinc-500">
                    Min views / 30d
                    <input type="number" min="0" value={cfg.wikipedia.minViews}
                      onChange={(e) => setWikiRule("minViews", parseInt(e.target.value) || 0)}
                      className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                  </label>
                  <label className="text-[10px] text-zinc-500">
                    Price @ 100k views ($)
                    <input type="number" min="0" step="0.01" value={cfg.wikipedia.priceAtAnchor}
                      onChange={(e) => setWikiRule("priceAtAnchor", parseFloat(e.target.value) || 0)}
                      className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                  </label>
                </div>
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5">
                    <span>Weight (× contribution)</span>
                    <span className="font-mono text-zinc-300">{cfg.wikipedia.weight.toFixed(2)}×</span>
                  </div>
                  <input type="range" min="0" max="1.5" step="0.05" value={cfg.wikipedia.weight}
                    onChange={(e) => setWikiWeight(parseFloat(e.target.value))}
                    className="w-full" />
                </div>
                <div className="mt-2 border-t border-zinc-800 pt-2">
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5">
                    <span>
                      Discount if they have socials
                      <InfoTooltip text="Followers and Wikipedia both measure the same fame, so counting both in full double-counts. This discounts Wikipedia by how much social reach already exists: 0 = never (pure additive); 0.6 = a heavily-followed person's Wikipedia adds ~40% of its value. A no-socials person's Wikipedia always counts in full." />
                    </span>
                    <span className="font-mono text-zinc-300">{Math.round(cfg.wikipediaSocialDamping * 100)}%</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.05" value={cfg.wikipediaSocialDamping}
                    onChange={(e) => setCfg((c) => ({ ...c, wikipediaSocialDamping: parseFloat(e.target.value) }))}
                    className="w-full" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-zinc-500">
              <span>
                Reach is additive
                <InfoTooltip text="Each reach component (platforms + Wikipedia) ADDS its price × weight into the total — so adding a signal can only raise the price, never lower it. Weights are multipliers (1× = full price), not shares. Blank / 0 / below-minimum components contribute nothing." />
              </span>
              <span>Σ reach prices → saturating top, no cap</span>
            </div>

            {/* Sentiment — a strength-weighted modifier on reach */}
            <div className="mt-3 rounded-md border border-violet-500/25 bg-violet-500/5 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-zinc-200">Sentiment</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-300 uppercase tracking-wide">signal</span>
              </div>
              <p className="text-[10px] text-zinc-500 mb-2 leading-relaxed">
                Adjusts the reach price by tone: <span className="font-mono">reach × (1 + weight × sentiment)</span>,
                but only once reach clears the threshold below. With little or no reach, sentiment has no effect —
                it refines an established price, it doesn&apos;t create one.
              </p>
              <div>
                <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5">
                  <span>Strength (± at full ±1 sentiment)</span>
                  <span className="font-mono text-zinc-300">±{Math.round(cfg.sentimentWeight * 100)}%</span>
                </div>
                <input type="range" min="0" max="1" step="0.05" value={cfg.sentimentWeight}
                  onChange={(e) => setSentimentWeight(parseFloat(e.target.value))}
                  className="w-full" />
              </div>
              <div className="mt-2">
                <label className="flex items-center justify-between text-[10px] text-zinc-500 mb-0.5">
                  <span>
                    Applies only above reach ($)
                    <InfoTooltip text="Sentiment only tilts the price once a person's REACH (socials + Wikipedia) reaches this dollar level — a proxy for real presence. Below it, scraped text has no effect; with no reach at all, sentiment never applies. This keeps a nobody with glowing news from being priced up." />
                  </span>
                  <input
                    type="number" min="0" step="0.5" value={cfg.sentimentMinReach}
                    onChange={(e) => setCfg((c) => ({ ...c, sentimentMinReach: Math.max(0, parseFloat(e.target.value) || 0) }))}
                    className="w-20 rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </label>
              </div>
              <p className="mt-2 pt-2 border-t border-violet-500/15 text-[10px] text-zinc-600 leading-relaxed">
                Scored by an entity-targeted LLM (Claude Haiku by default) — rates each scraped item&apos;s
                sentiment toward the person. Needs an LLM key server-side; provider is env-switchable.
              </p>
            </div>
          </section>
        </div>

        {/* ---------------- ADD PROFILE / APPLICATION ---------------- */}
        <div className="space-y-6 min-w-0">
          <section className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h2 className="text-sm font-semibold text-zinc-200">
                Add Profile
                <InfoTooltip text="Enter the person's handles and follower counts. Each platform yields a suggested price from the config; those combine into one weighted suggestion you can accept or override." />
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-zinc-500">Examples:</span>
                {SEED_PROFILES.slice(0, 6).map((p) => (
                  <button key={p.id} onClick={() => loadExample(p)}
                    className="text-[10px] rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 text-zinc-300 transition-colors">
                    {p.name}
                  </button>
                ))}
                <button onClick={clearAll}
                  className="text-[10px] rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 text-zinc-500 transition-colors">
                  Clear
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-zinc-400 mb-1">Name</label>
              <div className="flex items-center gap-2 flex-wrap">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Donovan Clingan"
                  onKeyDown={(e) => { if (e.key === "Enter") fetchAll(); }}
                  className="flex-1 min-w-[180px] max-w-sm rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                <button onClick={fetchAll} disabled={fetchingAll}
                  className="shrink-0 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed px-3.5 py-1.5 text-sm font-semibold text-white transition-colors">
                  {fetchingAll ? "Fetching…" : "Fetch all"}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-zinc-500">
                Looks up followers (for any handles entered), Wikipedia pageviews, and news — then scores sentiment. Runs every signal at once.
              </p>
            </div>

            {/* Per-platform rows. Followers drive the price; the handle is only
                the lookup key for the Fetch control (X + Instagram). TikTok and
                YouTube have no API, so they're follower-entry only. */}
            <div className="space-y-2">
              <div className="hidden md:grid grid-cols-[90px_150px_1fr_110px] gap-3 text-[10px] uppercase tracking-wide text-zinc-500 px-1">
                <span>Platform</span><span>Followers</span><span>Look up by handle</span><span className="text-right">Adds to reach</span>
              </div>
              {result.perPlatform.map((s) => (
                <div key={s.platform} className="grid grid-cols-2 md:grid-cols-[90px_150px_1fr_110px] gap-3 items-center rounded-md border border-zinc-800 bg-zinc-950/30 px-2 py-2">
                  <span className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                    {PLATFORM_LABELS[s.platform]}
                  </span>
                  <input
                    type="number" min="0" value={s.followers ?? ""}
                    onChange={(e) => setFollowers((f) => ({ ...f, [s.platform]: e.target.value === "" ? null : parseInt(e.target.value) }))}
                    placeholder="followers"
                    className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                  <div className="min-w-0">
                    {API_PLATFORMS[s.platform] ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={handles[s.platform]}
                          onChange={(e) => setHandles((h) => ({ ...h, [s.platform]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") fetchFollowers(s.platform); }}
                          placeholder="@handle"
                          className="flex-1 min-w-0 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                        />
                        <button onClick={() => fetchFollowers(s.platform)}
                          className="shrink-0 text-[10px] rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 text-zinc-300 transition-colors whitespace-nowrap">
                          Fetch
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-zinc-600 italic">no API — enter followers manually</span>
                    )}
                  </div>
                  <span className="text-right font-mono text-xs font-semibold">
                    {s.included ? (
                      <span className="text-violet-400" title={`${fmtPrice(s.price)} price × ${s.weight.toFixed(2)} weight = what this platform adds to reach`}>+{fmtPrice(s.contribution)}</span>
                    ) : s.followers == null ? (
                      <span className="text-zinc-600">—</span>
                    ) : (
                      <span className="text-zinc-600" title="Below minimum followers — excluded, adds nothing (not penalized)">excluded</span>
                    )}
                  </span>
                  {fetchMsg[s.platform] && (
                    <span className="col-span-2 md:col-span-4 text-[10px] text-zinc-500 md:pl-[104px]">{fetchMsg[s.platform]}</span>
                  )}
                </div>
              ))}

              {/* Wikipedia pageviews row */}
              <div className="grid grid-cols-2 md:grid-cols-[90px_150px_1fr_110px] gap-3 items-center rounded-md border border-zinc-800 bg-zinc-950/30 px-2 py-2">
                <span className="text-xs font-medium text-zinc-300">Wikipedia</span>
                <input
                  type="number" min="0" value={wikiViews ?? ""}
                  onChange={(e) => { setWikiViews(e.target.value === "" ? null : parseInt(e.target.value)); setWikiTitle(""); setWikiMsg(""); }}
                  placeholder="views / 30d"
                  className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <div className="min-w-0">
                  <button onClick={fetchWikipedia}
                    className="text-[10px] rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 text-zinc-300 transition-colors whitespace-nowrap">
                    Fetch pageviews
                  </button>
                  {wikiTitle && <span className="ml-2 text-[10px] text-zinc-500">{wikiTitle}</span>}
                </div>
                <span className="text-right font-mono text-xs font-semibold">
                  {result.wikipedia.included ? (
                    <span className="text-sky-400" title={`${fmtPrice(result.wikipedia.price)} price × ${result.wikipedia.weight.toFixed(2)} weight${result.wikipedia.dampingFactor < 0.999 ? ` × ${result.wikipedia.dampingFactor.toFixed(2)} (discounted — already has social reach)` : ""} = what Wikipedia adds to reach`}>
                      +{fmtPrice(result.wikipedia.contribution)}
                      {result.wikipedia.dampingFactor < 0.999 && <span className="ml-1 text-[9px] text-zinc-500">×{result.wikipedia.dampingFactor.toFixed(2)}</span>}
                    </span>
                  ) : wikiViews == null ? (
                    <span className="text-zinc-600">—</span>
                  ) : (
                    <span className="text-zinc-600" title="Below minimum views — excluded, adds nothing">excluded</span>
                  )}
                </span>
                {wikiMsg && (
                  <span className="col-span-2 md:col-span-4 text-[10px] text-zinc-500 md:pl-[104px]">{wikiMsg}</span>
                )}
              </div>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-zinc-500 leading-relaxed">
              Each row shows what it <span className="text-zinc-300">adds</span> (its price × weight). They{" "}
              <span className="text-zinc-300">sum</span> to reach — it&apos;s additive, not an average — then
              sentiment tilts the total. Full math in <span className="text-zinc-300">How it adds up</span> below.
            </p>

            {/* Sentiment */}
            <div className="mt-4">
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <label className="block text-xs text-zinc-400">
                  Scraped text (server-side) — one item per line
                  <span className="text-zinc-600"> · sources: {SENTIMENT_SOURCES.join(", ")}</span>
                  <InfoTooltip text="The text is scraped on our end — the person being listed does not enter it. 'Fetch news' pulls live Google News + Reddit + YouTube comments into this read-only view and scores them with an entity-targeted LLM, which tilts the reach price or prices a no-follower profile on its own." />
                </label>
                <button onClick={fetchNews}
                  className="text-[10px] rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 text-zinc-300 transition-colors whitespace-nowrap">
                  Fetch news
                </button>
              </div>
              {newsMsg && <p className="text-[10px] text-zinc-500 mb-1">{newsMsg}</p>}
              <textarea
                value={sentimentText} readOnly
                rows={3} placeholder="Click Fetch news — scraped text appears here (not entered by the person listing)"
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400 font-mono resize-y cursor-default focus:outline-none"
              />
              <div className="flex items-center gap-3 mt-1 text-[11px] flex-wrap">
                <span className="text-zinc-500">LLM sentiment:</span>
                <span className={"font-mono font-semibold " + (result.sentiment > 0.05 ? "text-emerald-400" : result.sentiment < -0.05 ? "text-orange-400" : "text-zinc-400")}>
                  {result.sentiment >= 0 ? "+" : ""}{result.sentiment.toFixed(3)}
                </span>
                <span className="text-zinc-600">
                  {result.sentiment > 0.05 ? "positive" : result.sentiment < -0.05 ? "negative" : "neutral"}
                </span>
                {result.hasSentiment && (
                  <span className="text-zinc-500">
                    {result.sentimentApplied
                      ? <>→ tilt <span className="font-mono text-violet-400">×{result.sentimentMultiplier.toFixed(2)}</span></>
                      : <span className="text-zinc-600">→ not applied ({result.hasReach ? `reach below ${fmtPrice(cfg.sentimentMinReach).replace(/\.0000$/, "")} threshold` : "no reach"})</span>}
                  </span>
                )}
              </div>
              <div className="mt-1.5">
                {llmMsg && <p className="text-[10px] text-zinc-500">{llmMsg}</p>}
                {!llm && !llmMsg && <p className="text-[10px] text-zinc-600">Fetch news scores each item toward the person automatically.</p>}
                {llm && llm.scores.length > 0 && (
                  <div className="mt-1 rounded-md border border-zinc-800 bg-zinc-950/40 p-2 max-h-40 overflow-y-auto space-y-1">
                    {llm.scores.map((s, i) => (
                      <div key={i} className="flex justify-between gap-3 text-[10px]">
                        <span className="text-zinc-400 leading-snug truncate" title={s.reason}>{s.text}</span>
                        <span className={"font-mono shrink-0 " + (s.score > 0.05 ? "text-emerald-400" : s.score < -0.05 ? "text-orange-400" : "text-zinc-500")}>
                          {s.score >= 0 ? "+" : ""}{s.score.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Suggestion + final price */}
          <section className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
            <h2 className="text-sm font-semibold text-zinc-200 mb-3">
              Suggested Price
              <InfoTooltip text="Reach is the sum of each included platform's price × its weight (plus Wikipedia); sentiment then tilts that total, but only once reach clears the configured threshold. No reach at all → no signal, set manually. Capped at the max price. A recommendation only; you type the final price below." />
            </h2>

            {result.hasSignal ? (
              <div className="mb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
                    <p className="text-[11px] text-zinc-400 mb-1">
                      Suggested price
                      <InfoTooltip text="Reach (sum of platform + Wikipedia contributions) tilted by sentiment. No ceiling by default — the price curve saturates at the top instead." />
                    </p>
                    <p className="text-2xl font-mono font-bold text-violet-300">{fmtPrice(result.suggested)}</p>
                  </div>
                  <StatCard label="Reference: pauv price" value={refPrice != null ? "$" + refPrice.toFixed(2) : "—"}
                    info="The live pauv NPSI for this person if they already trade (shown for loaded examples). Blank for a genuinely new listing." />
                </div>
                <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">How it adds up</p>
                  <div className="space-y-1 text-xs">
                    {(
                      <>
                        {result.perPlatform.filter((s) => s.included).map((s) => (
                          <div key={s.platform} className="flex justify-between">
                            <span className="text-zinc-400">
                              {PLATFORM_LABELS[s.platform]} <span className="text-zinc-600">{fmtPrice(s.price)} × {s.weight.toFixed(2)}</span>
                            </span>
                            <span className="font-mono text-zinc-300">+{fmtPrice(s.contribution)}</span>
                          </div>
                        ))}
                        {result.wikipedia.included && (
                          <div className="flex justify-between">
                            <span className="text-zinc-400">
                              Wikipedia <span className="text-zinc-600">{fmtPrice(result.wikipedia.price)} × {result.wikipedia.weight.toFixed(2)}{result.wikipedia.dampingFactor < 0.999 ? ` × ${result.wikipedia.dampingFactor.toFixed(2)}` : ""}</span>
                              {result.wikipedia.dampingFactor < 0.999 && <span className="ml-1 text-[10px] text-amber-500/80">discounted (has socials)</span>}
                            </span>
                            <span className="font-mono text-zinc-300">+{fmtPrice(result.wikipedia.contribution)}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-zinc-800 pt-1 mt-1">
                          <span className="text-zinc-400">Reach (sum)</span>
                          <span className="font-mono text-zinc-200">{fmtPrice(result.reachPrice)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Sentiment tilt</span>
                          {result.sentimentApplied
                            ? <span className="font-mono text-zinc-300">×{result.sentimentMultiplier.toFixed(3)}</span>
                            : <span className="text-zinc-600">not applied{result.hasSentiment ? ` (reach < ${fmtPrice(cfg.sentimentMinReach).replace(/\.0000$/, "")})` : ""}</span>}
                        </div>
                        <div className="flex justify-between font-semibold">
                          <span className="text-zinc-300">Suggested</span>
                          <span className="font-mono text-violet-400">{fmtPrice(result.suggested)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-4 rounded-lg border border-amber-600/40 bg-amber-500/5 p-4">
                <p className="text-sm font-semibold text-amber-400 mb-1">No reach — set price manually</p>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  No platform has followers above its minimum and no Wikipedia views, so there&apos;s no reach to
                  price from (sentiment only tilts existing reach, it can&apos;t price a profile on its own). Set
                  the price from judgment — or start from a comparable listing below.
                </p>
              </div>
            )}

            <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Final price ($) — you decide
                  </label>
                  <input
                    value={finalPrice}
                    onChange={(e) => { setFinalPrice(e.target.value); setFinalEdited(true); }}
                    inputMode="decimal"
                    placeholder={result.hasSignal ? undefined : "e.g. 12.00"}
                    className="w-40 rounded-md border border-violet-500/50 bg-zinc-900 px-3 py-2 text-lg font-mono font-bold text-violet-300 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
                {/* Comparable anchor — start from an existing pauv listing */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Price like…
                    <InfoTooltip text="Start the final price from someone already listed on pauv. Useful when there's no reach data — price a new director near other directors, etc." />
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      const p = comparables.find((c) => c.id === e.target.value);
                      if (p && p.marketNPSI != null) { setFinalPrice(p.marketNPSI.toFixed(4)); setFinalEdited(true); }
                    }}
                    className="w-52 rounded-md border border-zinc-600 bg-zinc-800 px-2 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  >
                    <option value="">Choose a comparable…</option>
                    {comparables.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — ${p.marketNPSI!.toFixed(2)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    {result.hasSignal
                      ? <>Pre-filled with the blended suggestion{result.suggested != null ? ` (${fmtPrice(result.suggested)})` : ""}. Edit freely — the suggestion is a reference, not the decision.</>
                      : <>No signal for this profile. Type a price or start from a comparable listing.</>}
                  </p>
                </div>
                {finalEdited && (
                  <button onClick={() => { setFinalEdited(false); }}
                    className="text-[11px] rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-zinc-400 transition-colors">
                    {result.hasSignal ? "Reset to suggestion" : "Clear"}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
            <h2 className="text-sm font-semibold text-zinc-300 mb-2">How the suggestion is built</h2>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-zinc-400 leading-relaxed">
              <li><span className="text-zinc-200 font-medium">Per platform.</span> Each platform maps followers to a price: the floor at/below its minimum, rising to your configured price at 100k followers. A platform with no real reach (blank, 0, or below minimum) is excluded — it contributes nothing, never a $0.01 that drags you down.</li>
              <li><span className="text-zinc-200 font-medium">Add up reach.</span> Each row&apos;s price × its weight is <span className="text-zinc-200">summed</span> (platforms + Wikipedia) — additive, not an average, so adding a signal can only raise the price. It&apos;s the sum, which is why the total can exceed any single row.</li>
              <li><span className="text-zinc-200 font-medium">Tilt by sentiment.</span> The scraped text is scored and scales reach by <span className="font-mono">1 + strength × sentiment</span>, but <span className="text-zinc-200">only once reach clears the threshold</span> — sentiment refines an established price, it can&apos;t price a profile with little or no reach.</li>
              <li><span className="text-zinc-200 font-medium">No cap.</span> Like an IPO, there&apos;s no ceiling — the biggest can always price higher. Instead of a hard max, the price curve <span className="text-zinc-200">saturates</span> above 100k followers (diminishing returns), so mega-accounts stay ranked without running into the thousands.</li>
              <li><span className="text-zinc-200 font-medium">You decide.</span> The result seeds the final-price field; a human always makes the call. No signal at all → set it manually or from a comparable.</li>
            </ol>
          </section>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, info, muted }: { label: string; value: string; info: string; muted?: boolean }) {
  return (
    <div className={"rounded-lg border border-zinc-700 bg-zinc-950/40 p-3 " + (muted ? "opacity-50" : "")}>
      <p className="text-[11px] text-zinc-400 mb-1">
        {label}
        <InfoTooltip text={info} />
      </p>
      <p className="text-lg font-mono font-semibold text-zinc-100">{value}</p>
    </div>
  );
}
