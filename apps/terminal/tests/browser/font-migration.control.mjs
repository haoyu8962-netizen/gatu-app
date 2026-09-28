// Usage: node tests/browser/font-migration.control.mjs (from apps/terminal). Negative controls for
// font-migration.run.mjs: two of the three pairs must be reported as different.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
const appRoot = fileURLToPath(new URL("../..", import.meta.url));
const server = spawn("pnpm", ["exec", "vite", "--config", "tests/browser/vite.config.ts", "--host", "127.0.0.1", "--port", "4199", "--strictPort"], { cwd: appRoot, stdio: "ignore", detached: true });
for (let i = 0; i < 120; i++) { try { if ((await fetch("http://127.0.0.1:4199/font-migration.html")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 1000)); }
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:4199/font-migration.html", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof window.runFontMigrationControls === "function");
const result = await page.evaluate(() => window.runFontMigrationControls());
for (const d of result.differences) console.log(`[${d.file}] context="${d.context}" merged=${d.merged} differing=${d.properties.join(",")}`);
console.log(`controls: pairs=${result.pairs} comparisons=${result.comparisons} differences=${result.differences.length}`);
await browser.close();
try { process.kill(-server.pid, "SIGTERM"); } catch {}
process.exit(0);
