// Renders the two legal-review reels from reel.html, frame by frame.
// Needs the design-handoff static server on port 3020 and ffmpeg with libx264 and libsvtav1.
// Usage (repository root): node designs/beyond-crypto-review/tools/render-reel.cjs
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "../../..");
const { chromium } = require(require.resolve("@playwright/test", { paths: [path.join(root, "apps/terminal")] }));
const outDir = path.resolve(__dirname, "../media");
const FPS = 30;
const POSTER_AT = 1.2;

async function render(browser, variant) {
	const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
	await page.goto(`http://localhost:3020/beyond-crypto-review/reel.html?variant=${variant}`);
	await page.evaluate(() => document.fonts.ready);
	const duration = await page.evaluate(() => window.duration);
	const work = fs.mkdtempSync(path.join(os.tmpdir(), `sairn-reel-${variant}-`));
	const frames = Math.round(duration * FPS);
	for (let i = 0; i < frames; i += 1) {
		await page.evaluate((t) => window.seek(t), i / FPS);
		await page.screenshot({ path: path.join(work, `f${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
	}
	await page.close();
	const mp4 = path.join(outDir, `reel-${variant}.mp4`);
	const webm = path.join(outDir, `reel-${variant}.webm`);
	const poster = path.join(outDir, `reel-${variant}.jpg`);
	const run = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { env: { ...process.env, SVT_LOG: "1" } });
	run(["-framerate", String(FPS), "-i", path.join(work, "f%05d.jpg"), "-vf", "format=yuv420p", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-movflags", "+faststart", mp4]);
	run(["-i", mp4, "-an", "-c:v", "libsvtav1", "-preset", "5", "-crf", "40", webm]);
	run(["-ss", String(POSTER_AT), "-i", mp4, "-frames:v", "1", "-q:v", "3", poster]);
	fs.rmSync(work, { recursive: true, force: true });
	return { variant, seconds: duration, frames, bytes: { mp4: fs.statSync(mp4).size, webm: fs.statSync(webm).size, poster: fs.statSync(poster).size } };
}

(async () => {
	fs.mkdirSync(outDir, { recursive: true });
	const browser = await chromium.launch();
	try {
		for (const variant of ["generic", "named"]) console.log(JSON.stringify(await render(browser, variant)));
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
