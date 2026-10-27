// Captures the signed-out Sairn terminal for the hero's Terminal view.
// Usage (repository root): node designs/website-hero-prototype/tools/capture-terminal.cjs
// A spot market is used because spot has no leverage control; the crop stops above the account
// tables. Each capture runs in a fresh browser context with no stored session, which is what
// makes it signed out. The DOM guard (guard.cjs) checks the cropped area before and after the
// screenshot and, in the page, on every animation frame in between; it rejects leverage, HIP-3
// markets, wallet addresses and brands, testnet, PnL, account summaries and money amounts (only
// zero may follow "Available"; the market header's volume, market cap and contract address, the
// phone book's mid price and the desktop book tooltip's quote total pass in their own elements),
// and it requires a visible Connect control and the HYPE/USDC title with its Spot badge. Files are
// written only when every shot passes. Before the shots, the deployed build-meta.json is read and
// its build identification is stored in the report as terminalBuild (null with the reason when it
// cannot be read).
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "../../..");
const { chromium } = require(require.resolve("@playwright/test", { paths: [path.join(root, "apps/terminal")] }));
const { accountTableTop, assertClean, loadGuardConfig, makeGuard, pageGuardSource, readTerminalBuild, recordedClip } = require("./guard.cjs");
const outDir = path.resolve(__dirname, "../assets");
// The shared guard requires the HYPE/USDC spot title, so the route is fixed.
const route = "/trade/HYPE/USDC";
const BASE = "https://app.sairn.ai";
const url = `${BASE}${route}`;

const SHOTS = [
	{ name: "desktop", viewport: { width: 1440, height: 900 }, dpr: 1.5, mobile: false },
	{ name: "mobile", viewport: { width: 390, height: 844 }, dpr: 2, mobile: true },
];

async function main() {
	const browser = await chromium.launch();
	const report = { url, capturedAt: new Date().toISOString(), shots: [] };
	const outputs = [];
	let config;
	try {
		config = await loadGuardConfig(browser);
		const build = await readTerminalBuild(browser, BASE);
		if (!build.terminalBuild) console.warn(`terminal build unknown, capturing anyway: ${build.terminalBuildError}`);
		Object.assign(report, build);
		for (const shot of SHOTS) {
			const context = await browser.newContext({
				viewport: shot.viewport,
				deviceScaleFactor: shot.dpr,
				isMobile: shot.mobile,
				hasTouch: shot.mobile,
				locale: "en-US",
				timezoneId: "UTC",
				colorScheme: "dark",
			});
			try {
				const page = await context.newPage();
				await page.goto(url, { waitUntil: "domcontentloaded" });
				await page.waitForTimeout(15000);
				const clipBottom = await accountTableTop(page);
				if (!clipBottom) throw new Error(`${shot.name}: account table not found, crop cannot be placed`);
				const area = recordedClip(shot.viewport.width, clipBottom);
				await page.evaluate(pageGuardSource(area, config));
				await page.waitForFunction(() => window.__sairnGuard?.read().checks > 0);
				const before = await assertClean(page, area, config, `${shot.name} before`);
				const image = await page.screenshot({ clip: { x: 0, y: 0, width: shot.viewport.width, height: clipBottom }, type: "jpeg", quality: 82 });
				const after = await assertClean(page, area, config, `${shot.name} after`);
				const pageGuard = await page.evaluate(() => window.__sairnGuard.read());
				if (pageGuard.violations.length) throw new Error(`${shot.name}: in-page guard rejected a frame\n${pageGuard.violations[0].hits.join("\n")}`);
				const file = `terminal-${shot.name}.jpg`;
				outputs.push([file, image]);
				report.shots.push({
					name: shot.name,
					file,
					viewport: shot.viewport,
					dpr: shot.dpr,
					clip: { x: 0, y: 0, width: shot.viewport.width, height: clipBottom },
					guardedEntries: { before: before.entries, after: after.entries },
					pageChecks: pageGuard.checks,
					uncheckedIframes: [...new Set([...[...before.frames, ...after.frames].filter((f) => !f.checked).map((f) => f.src), ...pageGuard.uncheckedFrames])],
				});
			} finally {
				await context.close();
			}
		}
	} finally {
		await browser.close();
	}
	for (const [file, image] of outputs) fs.writeFileSync(path.join(outDir, file), image);
	report.guards = makeGuard(config).rules;
	fs.writeFileSync(path.join(outDir, "terminal-capture.json"), `${JSON.stringify(report, null, "\t")}\n`);
	console.log(JSON.stringify(report.shots));
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
