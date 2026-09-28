// Usage: node tests/browser/font-migration.run.mjs <result.json> (from apps/terminal). Evidence for the
// 2026-09-20 font-size migration; see docs/work-memory/sessions/2026-09-20-release-readiness-checks.md.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const PORT = 4199;
const URL_BASE = `http://127.0.0.1:${PORT}`;
const appRoot = fileURLToPath(new URL("../..", import.meta.url));
const server = spawn(
	"pnpm",
	["exec", "vite", "--config", "tests/browser/vite.config.ts", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
	{ cwd: appRoot, stdio: ["ignore", "pipe", "pipe"], detached: true },
);
let serverLog = "";
server.stdout.on("data", (chunk) => {
	serverLog += chunk;
});
server.stderr.on("data", (chunk) => {
	serverLog += chunk;
});

async function waitForServer() {
	for (let attempt = 0; attempt < 120; attempt++) {
		try {
			const response = await fetch(`${URL_BASE}/font-migration.html`);
			if (response.ok) return;
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw new Error(`fixture server did not start\n${serverLog}`);
}

const results = [];
let browser;
try {
	await waitForServer();
	browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
	for (const theme of ["dark", "light"]) {
		for (const width of [1440, 1001, 1000, 375, 360]) {
			const page = await browser.newPage({ viewport: { width, height: 900 } });
			await page.goto(`${URL_BASE}/font-migration.html`, { waitUntil: "networkidle" });
			await page.evaluate((value) => {
				document.documentElement.className = value;
			}, theme);
			await page.waitForFunction(() => typeof window.runFontMigrationCheck === "function");
			await page.evaluate(() => document.fonts.ready);
			results.push(await page.evaluate(() => window.runFontMigrationCheck()));
			await page.close();
		}
	}
} finally {
	await browser?.close();
	try {
		process.kill(-server.pid, "SIGTERM");
	} catch {}
}

writeFileSync(process.argv[2], JSON.stringify(results, null, 1));
for (const result of results) {
	console.log(
		`${result.theme.padEnd(5)} ${String(result.viewport).padStart(4)}px  pairs=${result.pairs} comparisons=${result.comparisons} props/element=${result.computedPropertiesPerElement} sizeRuleMissing=${result.sizeRuleMissing} differences=${result.differences.length}`,
	);
}
const all = results.flatMap((result) => result.differences.map((d) => ({ ...d, theme: result.theme, viewport: result.viewport })));
console.log(`TOTAL differences: ${all.length}`);
for (const d of all.slice(0, 10)) console.log(JSON.stringify(d).slice(0, 400));
