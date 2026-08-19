import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const [url, screenshotPath, tracePath, playwrightCorePath, executablePath] = process.argv.slice(2);
if (!url || !screenshotPath || !tracePath || !playwrightCorePath || !executablePath) {
	throw new Error("Expected URL, screenshot path, trace path, Playwright Core path, and Chromium path");
}

const require = createRequire(import.meta.url);
const { chromium } = require(playwrightCorePath);
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ colorScheme: "dark", viewport: { width: 900, height: 500 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const traceEvents = [];
cdp.on("Tracing.dataCollected", ({ value }) => traceEvents.push(...value));

try {
	await page.goto(url, { waitUntil: "networkidle" });
	await page.locator('input[type="range"]').waitFor();
	const geometry = await page.locator('input[type="range"]').evaluate((input) => {
		const control = input.parentElement?.parentElement;
		if (!(control instanceof HTMLElement)) throw new Error("Slider control is missing");
		const rect = control.getBoundingClientRect();
		return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
	});
	const startX = geometry.left + geometry.width * 0.25;
	const endX = geometry.left + geometry.width * 0.9;
	const y = geometry.top + geometry.height / 2;

	await page.mouse.move(startX, y);
	await page.evaluate(() => window.__gatuSliderPerf.reset());
	await cdp.send("Tracing.start", {
		categories: "devtools.timeline,v8.execute,blink.user_timing,latencyInfo,renderer.scheduler,toplevel",
		transferMode: "ReportEvents",
	});
	await cdp.send("Input.dispatchMouseEvent", {
		button: "left",
		buttons: 1,
		clickCount: 1,
		type: "mousePressed",
		x: startX,
		y,
	});
	const movePromises = Array.from({ length: 120 }, (_, offset) => {
		const index = offset + 1;
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				const ratio = index / 120;
				cdp
					.send("Input.dispatchMouseEvent", {
						button: "none",
						buttons: 1,
						type: "mouseMoved",
						x: startX + (endX - startX) * ratio,
						y,
					})
					.then(resolve, reject);
			}, offset * (1000 / 120));
		});
	});
	await Promise.all(movePromises);
	await cdp.send("Input.dispatchMouseEvent", {
		button: "left",
		buttons: 0,
		clickCount: 1,
		type: "mouseReleased",
		x: endX,
		y,
	});
	await page.waitForTimeout(100);
	const result = await page.evaluate(() => window.__gatuSliderPerf.stop());

	const traceComplete = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
	await cdp.send("Tracing.end");
	await traceComplete;
	await page.screenshot({ path: screenshotPath });
	writeFileSync(tracePath, JSON.stringify({ traceEvents }));
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

	if (result.previewCallbacks < 60) {
		throw new Error(`Expected at least 60 pointer-driven previews, received ${result.previewCallbacks}`);
	}
	if (result.previewCallbackRateHz < 50 || result.previewCallbackRateHz > 140) {
		throw new Error(`Pointer preview rate ${result.previewCallbackRateHz.toFixed(2)}Hz is outside 50–140Hz`);
	}
	if (result.maxParentCommitsPerFrame > 1) {
		throw new Error(`Observed ${result.maxParentCommitsPerFrame} parent commits in one animation frame`);
	}
	if (result.commitCallbacks !== 1) {
		throw new Error(`Expected one Base UI committed callback, received ${result.commitCallbacks}`);
	}
} finally {
	await browser.close();
}
