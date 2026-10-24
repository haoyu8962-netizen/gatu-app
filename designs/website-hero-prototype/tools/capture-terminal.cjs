// Captures the signed-out Sairn terminal for the hero's Terminal view.
// Usage (repository root): node designs/website-hero-prototype/tools/capture-terminal.cjs [path]
// A spot market is used because spot has no leverage control; the crop stops above the
// account tables. The DOM guard fails the capture when the cropped area shows leverage,
// HIP-3 markets, wallet brands, testnet, PnL or account figures, and it requires a
// visible Connect button so the capture provably comes from a signed-out session.
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "../../..");
const { chromium } = require(require.resolve("@playwright/test", { paths: [path.join(root, "apps/terminal")] }));
const outDir = path.resolve(__dirname, "../assets");
const route = process.argv[2] ?? "/trade/HYPE/USDC";
const url = `https://app.sairn.ai${route}`;

const GUARDS = [
	["leverage", /\b\d+(\.\d+)?\s?x\b/i],
	["HIP-3 market", /xyz:/i],
	["wallet brand", /metamask|coinbase|okx|binance|walletconnect|rabby|phantom|rainbow/i],
	["testnet", /testnet/i],
	["PnL", /\bpnl\b|unrealized|realized/i],
	["account summary", /portfolio value|account margin ratio|maintenance margin/i],
];

const SHOTS = [
	{ name: "desktop", viewport: { width: 1440, height: 900 }, dpr: 1.5, mobile: false },
	{ name: "mobile", viewport: { width: 390, height: 844 }, dpr: 2, mobile: true },
];

async function main() {
	const browser = await chromium.launch();
	const report = { url, capturedAt: new Date().toISOString(), shots: [] };
	try {
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
			const page = await context.newPage();
			await page.goto(url, { waitUntil: "domcontentloaded" });
			await page.waitForTimeout(15000);
			const clipBottom = await page.evaluate(() => {
				const tab = [...document.querySelectorAll("button, [role=tab]")].find((el) => el.textContent.trim() === "Balances");
				const strip = tab?.closest("[role=tablist]") ?? tab?.parentElement;
				return strip ? Math.floor(strip.getBoundingClientRect().top) : null;
			});
			if (!clipBottom) throw new Error(`${shot.name}: account table not found, crop cannot be placed`);
			const clip = { x: 0, y: 0, width: shot.viewport.width, height: clipBottom };
			const texts = await page.evaluate((bottom) => {
				const out = [];
				const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
				while (walker.nextNode()) {
					const node = walker.currentNode;
					const text = node.textContent.trim();
					if (!text) continue;
					const el = node.parentElement;
					const style = getComputedStyle(el);
					if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
					const rect = el.getBoundingClientRect();
					if (rect.width === 0 || rect.height === 0 || rect.top >= bottom || rect.bottom <= 0) continue;
					out.push(text);
				}
				return out;
			}, clipBottom);
			const signedOut = texts.some((text) => /^connect( wallet)?$/i.test(text));
			if (!signedOut) throw new Error(`${shot.name}: no visible Connect button, the session may be signed in`);
			const hits = [];
			for (const text of texts) for (const [name, re] of GUARDS) if (re.test(text)) hits.push(`${name}: ${text}`);
			if (hits.length) throw new Error(`${shot.name}: DOM guard rejected the capture\n${hits.join("\n")}`);
			const file = path.join(outDir, `terminal-${shot.name}.jpg`);
			await page.screenshot({ path: file, clip, type: "jpeg", quality: 82 });
			report.shots.push({ name: shot.name, file: path.basename(file), viewport: shot.viewport, dpr: shot.dpr, clip, guardedTexts: texts.length });
			await context.close();
		}
	} finally {
		await browser.close();
	}
	report.guards = GUARDS.map(([name, re]) => `${name}: ${re}`);
	fs.writeFileSync(path.join(outDir, "terminal-capture.json"), `${JSON.stringify(report, null, "\t")}\n`);
	console.log(JSON.stringify(report.shots));
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
