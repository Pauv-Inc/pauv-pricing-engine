// One-time login: opens a real Chromium with the SAME persistent profile that
// /api/discover uses, so you log into IG / X / TikTok once and stay logged in.
//
//   npm run pw:install   # first time only — downloads Chromium
//   npm run pw:login     # log into each tab, then close the window
//
import { chromium } from "playwright";

const userDataDir = process.env.PLAYWRIGHT_USER_DATA_DIR || "./.pw-profile";

const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  args: ["--disable-blink-features=AutomationControlled"],
});

const tabs = [
  "https://www.instagram.com/accounts/login/",
  "https://x.com/i/flow/login",
  "https://www.tiktok.com/login",
];
for (const url of tabs) {
  const p = await ctx.newPage();
  await p.goto(url).catch(() => {});
}
// Close the leftover blank first tab if present.
const [first] = ctx.pages();
if (first && first.url() === "about:blank") await first.close().catch(() => {});

console.log("\n✅ Log into each tab. Your session is saved to", userDataDir);
console.log("   Close the browser window when you're done — that's it.\n");

await new Promise((resolve) => ctx.on("close", resolve));
console.log("Saved. You can now use Discover in the pricer.");
