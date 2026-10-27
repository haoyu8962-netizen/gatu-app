// Renders the cold-start posters from a recording.
// Needs the design-handoff static server on port 3020 (see README.md).
// Usage (repository root): node designs/website-hero-prototype/tools/render-posters.cjs <recording file name>
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "../../..");
const { chromium } = require(require.resolve("@playwright/test", { paths: [path.join(root, "apps/terminal")] }));
const outDir = path.resolve(__dirname, "../posters");
const file = process.argv[2];
if (!file) throw new Error("Pass the recording file name from recorded/");

(async () => {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		page.on("console", (msg) => console.log("page:", msg.text()));
		page.on("pageerror", (error) => console.error("page error:", error.message));
		await page.goto(`http://localhost:3020/website-hero-prototype/tools/poster.html?rec=${encodeURIComponent(file)}`);
		const result = await page.evaluate(() => window.posterResults);
		const coin = result.coin.toLowerCase();
		const meta = { recording: result.file, coin: result.coin, recordedFrom: null, recordedTo: null, closes24h: result.closes24h, posters: {} };
		for (const poster of result.posters) {
			const name = `${coin}-${poster.key}.jpg`;
			fs.writeFileSync(path.join(outDir, name), Buffer.from(poster.jpeg, "base64"));
			const config = result.configs.find((c) => c.key === poster.key);
			meta.recordedFrom = poster.ui.recordedFrom;
			meta.recordedTo = Math.max(meta.recordedTo ?? 0, poster.ui.recordedTo);
			meta.posters[poster.key] = { file: name, width: Math.max(1, Math.round(config.cssW * config.dpr)), height: Math.max(1, Math.round(config.cssH * config.dpr)), ui: poster.ui };
			console.log(name, Buffer.from(poster.jpeg, "base64").length, "bytes", "live", poster.ui.live, "window", poster.ui.windowSeconds);
		}
		fs.writeFileSync(path.join(outDir, `${coin}.json`), `${JSON.stringify(meta, null, "\t")}\n`);
	} finally {
		await browser.close();
	}
})();
