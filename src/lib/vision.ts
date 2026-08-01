// ============================================================
// Vision fallback: read a follower count off a screenshot.
// ============================================================
// When DOM/JSON parsing fails, we screenshot the profile and ask a MULTIMODAL
// model to read the follower number. Groq's Llama-70B is text-only, so this uses
// a vision-capable model via an OpenAI-compatible endpoint — Gemini's free tier
// by default (multimodal), configurable with the VISION_* / LLM_* envs.
// ============================================================

import OpenAI from "openai";

function cleanEnv(v: string | undefined): string | undefined {
  if (v == null) return undefined;
  return v.trim().replace(/^["']|["']$/g, "").trim();
}

// Parse a human follower string ("1.2M", "12,345", "1.5K") into an integer.
export function parseCount(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw) : null;
  const s = raw.replace(/[, ]/g, "").trim().toUpperCase();
  const m = s.match(/^([\d.]+)\s*([KMB]?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = m[2] === "B" ? 1e9 : m[2] === "M" ? 1e6 : m[2] === "K" ? 1e3 : 1;
  return Math.round(n * mult);
}

// Returns the follower count read from the image, or null.
export async function readCountFromImage(pngBase64: string, platform: string): Promise<number | null> {
  // Default to Google (Gemini) — multimodal, free tier. Falls back to any
  // configured vision-capable OpenAI-compatible endpoint.
  const baseURL =
    cleanEnv(process.env.VISION_BASE_URL) ||
    "https://generativelanguage.googleapis.com/v1beta/openai";
  const model = cleanEnv(process.env.VISION_MODEL) || "gemini-2.0-flash";
  const apiKey =
    cleanEnv(process.env.VISION_API_KEY) ||
    cleanEnv(process.env.GOOGLE_API_KEY) ||
    cleanEnv(process.env.GEMINI_API_KEY) ||
    cleanEnv(process.env.LLM_API_KEY);
  if (!apiKey) return null; // no vision key configured → skip the fallback

  const client = new OpenAI({ apiKey, baseURL });
  const resp = await client.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 40,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `This is a screenshot of a ${platform} profile page. Read the FOLLOWER count ` +
              `(followers, not following/likes/posts). Reply with ONLY the number exactly as ` +
              `shown (e.g. "1.2M", "12,345"). If you can't find it, reply "none".`,
          },
          { type: "image_url", image_url: { url: `data:image/png;base64,${pngBase64}` } },
        ],
      },
    ],
  });
  const text = resp.choices[0]?.message?.content?.trim() ?? "";
  if (/^none$/i.test(text)) return null;
  return parseCount(text);
}
