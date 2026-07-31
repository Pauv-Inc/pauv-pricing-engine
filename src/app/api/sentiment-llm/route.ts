import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// ============================================================
// POST /api/sentiment-llm   { name, texts: string[] }
// ============================================================
// Entity-targeted sentiment: rates each item's sentiment TOWARD the named person
// (−1..+1 with a reason), so incidental mentions score ~0 and world-knowledge
// cues land right — the thing a word-list scorer can't do.
//
// PROVIDER LAYER — switch models/providers with env only, no code change:
//   SENTIMENT_PROVIDER   anthropic (default) | groq | google | deepseek | openai | openai-compatible
//   SENTIMENT_MODEL      provider-appropriate model id
//   SENTIMENT_API_KEY    the provider's key (per-provider env fallbacks below)
//   SENTIMENT_BASE_URL   base URL for a generic openai-compatible endpoint
//
// FREE options: groq (no credit card, Llama-70B — plenty for this classification
// task) and google (Gemini free tier) both have generous free tiers. This is a
// sentiment score, not creative work, so a free model is a fine choice.
//
// Anthropic is the default; the rest are opt-in. Server-side only — keys never
// reach the browser. Mock-first: returns 501 until a key is configured.
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Provider = "anthropic" | "groq" | "google" | "deepseek" | "openai" | "openai-compatible";

function resolveProvider(): Provider {
  const p = (process.env.SENTIMENT_PROVIDER || "").toLowerCase();
  if (p === "gemini") return "google";
  if (p === "groq" || p === "google" || p === "deepseek" || p === "openai" || p === "openai-compatible") return p;
  // No explicit provider: a generic LLM_BASE_URL (e.g. Groq) means an
  // OpenAI-compatible backend configured via LLM_BASE_URL/LLM_MODEL/LLM_API_KEY.
  if (process.env.LLM_BASE_URL) return "openai-compatible";
  return "anthropic";
}

// Sensible per-provider defaults (overridable via SENTIMENT_MODEL / SENTIMENT_BASE_URL).
// groq + google expose OpenAI-compatible endpoints, so they reuse that path.
const DEFAULTS: Record<Provider, { model: string; baseURL?: string }> = {
  anthropic: { model: "claude-haiku-4-5" },
  groq: { model: "llama-3.3-70b-versatile", baseURL: "https://api.groq.com/openai/v1" },
  google: { model: "gemini-2.0-flash", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai" },
  deepseek: { model: "deepseek-chat", baseURL: "https://api.deepseek.com" },
  openai: { model: "gpt-4o-mini" },
  "openai-compatible": { model: "" },
};

// Per-provider convenience env fallbacks so users can set the "natural" key name.
// LLM_API_KEY is the generic final fallback (pairs with LLM_BASE_URL/LLM_MODEL).
function resolveApiKey(provider: Provider): string | undefined {
  if (process.env.SENTIMENT_API_KEY) return process.env.SENTIMENT_API_KEY;
  const perProvider =
    provider === "anthropic" ? process.env.ANTHROPIC_API_KEY :
    provider === "groq" ? process.env.GROQ_API_KEY :
    provider === "google" ? (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) :
    provider === "openai" ? process.env.OPENAI_API_KEY :
    provider === "deepseek" ? process.env.DEEPSEEK_API_KEY :
    undefined;
  return perProvider || process.env.LLM_API_KEY;
}

const clamp = (n: number) => Math.max(-1, Math.min(1, n));

interface Scored { text: string; score: number; reason: string }

// JSON Schema for Anthropic's structured output. (No numeric min/max — those
// aren't supported in structured outputs; we clamp server-side.)
const SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          score: { type: "number" },
          reason: { type: "string" },
        },
        required: ["text", "score", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["scores"],
  additionalProperties: false,
} as const;

function buildPrompt(name: string, texts: string[]) {
  const system =
    `You score public sentiment for a pricing index. For each item of text about a ` +
    `public figure, rate how POSITIVE or NEGATIVE it is TOWARD that specific person, ` +
    `from -1 (very negative about them) to +1 (very positive about them). Judge sentiment ` +
    `toward the named person only — if a headline is about someone else and merely mentions ` +
    `them, or is purely factual/neutral, score near 0. Use world knowledge: events like an ` +
    `indictment, scandal, or loss are negative; awards, wins, and praise are positive, even ` +
    `with no explicit sentiment words. Keep each reason to a short clause. ` +
    `Respond with JSON of the form {"scores":[{"text":string,"score":number,"reason":string}]}.`;
  const user =
    `Person: ${name}\n\nItems (score each toward ${name}):\n` +
    texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  return { system, user };
}

// --- Anthropic path (schema-enforced structured output) ---
async function scoreAnthropic(name: string, texts: string[], apiKey: string, model: string): Promise<Scored[]> {
  const client = new Anthropic({ apiKey });
  const { system, user } = buildPrompt(name, texts);
  const resp = await client.messages.create({
    model,
    max_tokens: 2048,
    temperature: 0, // deterministic: same headlines → same scores (stable price)
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });
  const block = resp.content.find((b) => b.type === "text");
  const raw = block && "text" in block ? block.text : "";
  return (JSON.parse(raw)?.scores ?? []) as Scored[];
}

// --- OpenAI-compatible path (JSON mode) — DeepSeek, OpenAI, etc. ---
async function scoreOpenAICompatible(name: string, texts: string[], apiKey: string, model: string, baseURL?: string): Promise<Scored[]> {
  const client = new OpenAI({ apiKey, baseURL });
  const { system, user } = buildPrompt(name, texts);
  const resp = await client.chat.completions.create({
    model,
    max_tokens: 2048,
    temperature: 0, // deterministic decoding — same headlines → same scores
    seed: 42,       // extra reproducibility on providers that honor it (Groq, OpenAI)
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });
  const raw = resp.choices[0]?.message?.content ?? "";
  return (JSON.parse(raw)?.scores ?? []) as Scored[];
}

// Env values pasted into a dashboard (Vercel etc.) often pick up stray wrapping
// quotes or trailing whitespace/newlines — which make a model id or key silently
// wrong ("model does not exist"). Normalize before use.
function cleanEnv(v: string | undefined): string | undefined {
  if (v == null) return undefined;
  return v.trim().replace(/^["']|["']$/g, "").trim();
}

export async function POST(request: Request) {
  const provider = resolveProvider();
  const model = cleanEnv(process.env.SENTIMENT_MODEL || DEFAULTS[provider].model || process.env.LLM_MODEL) || "";
  const baseURL = cleanEnv(process.env.SENTIMENT_BASE_URL || DEFAULTS[provider].baseURL || process.env.LLM_BASE_URL);
  const apiKey = cleanEnv(resolveApiKey(provider));

  if (!apiKey) {
    const keyHint: Record<Provider, string> = {
      anthropic: "ANTHROPIC_API_KEY",
      groq: "GROQ_API_KEY (free at console.groq.com)",
      google: "GOOGLE_API_KEY (free at aistudio.google.com)",
      openai: "OPENAI_API_KEY",
      deepseek: "DEEPSEEK_API_KEY",
      "openai-compatible": "SENTIMENT_API_KEY",
    };
    return NextResponse.json(
      { error: `LLM sentiment not configured for provider "${provider}". Set ${keyHint[provider]} in .env.local (server-side), then Fetch again. Until then, sentiment stays neutral and the price is reach-only.` },
      { status: 501 }
    );
  }
  if ((provider === "openai-compatible") && !baseURL) {
    return NextResponse.json({ error: "SENTIMENT_BASE_URL is required for provider openai-compatible" }, { status: 500 });
  }
  if (!model) {
    return NextResponse.json({ error: "SENTIMENT_MODEL is required (no default for this provider)" }, { status: 500 });
  }

  let body: { name?: string; texts?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const name = (body.name || "").trim();
  const texts = (body.texts || []).map((t) => String(t).trim()).filter(Boolean);
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!texts.length) return NextResponse.json({ error: "texts is required" }, { status: 400 });

  try {
    const rawScores =
      provider === "anthropic"
        ? await scoreAnthropic(name, texts, apiKey, model)
        : await scoreOpenAICompatible(name, texts, apiKey, model, baseURL);

    const scores = rawScores.map((s) => ({
      text: s.text,
      score: clamp(Number(s.score) || 0),
      reason: s.reason || "",
    }));
    const overall = scores.length ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length : 0;

    return NextResponse.json({ name, provider, model, overall, scores });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "LLM scoring failed" },
      { status: 502 }
    );
  }
}
