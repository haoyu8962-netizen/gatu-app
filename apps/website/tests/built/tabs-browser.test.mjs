// The three tab blocks (hero preview, 03 markets, 04 features) in headless Chromium on the built page: without
// JavaScript, with the tab module blocked, with it delayed, and wired. tabs.ts and the tab rules in global.css own
// the behaviour; a CSS-string check cannot show that a panel is actually visible (Tailwind's preflight gives
// [hidden] `display: none !important`, which beat the old fallback rule).

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { launch, openPage } from "./browser.mjs";

let browser;
before(async () => {
	browser = await launch();
});
after(async () => {
	await browser?.close();
});

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

/**
 * For every [data-tabs] block: whether its tab list shows, and each panel's visibility and text. Read two frames
 * later: under the reduced-motion context the site's 0.01ms transitions hold a just-changed `visibility` at its old
 * value until the next frame (a page without JavaScript runs no frame callbacks, and has nothing to settle).
 */
async function readTabBlocks(page, { javaScript = true } = {}) {
	if (javaScript) await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
	return page.evaluate(() =>
		[...document.querySelectorAll("[data-tabs]")].map((block) => {
			const list = block.querySelector("[data-tablist]");
			const tabs = [...list.querySelectorAll('[role="tab"]')];
			return {
				ready: block.hasAttribute("data-tabs-ready"),
				listShown: list.checkVisibility({ visibilityProperty: true }),
				orientation: list.getAttribute("aria-orientation"),
				flexDirection: getComputedStyle(list).flexDirection,
				panels: tabs.map((tab) => {
					const panel = document.getElementById(tab.getAttribute("aria-controls"));
					return {
						id: panel.id,
						requiresJs: panel.hasAttribute("data-requires-js"),
						shown: panel.checkVisibility({ visibilityProperty: true }) && panel.getBoundingClientRect().height > 0,
						text: panel.innerText.replace(/\s+/g, " ").trim(),
						heading: panel.querySelector("h3")?.innerText.trim() ?? null,
						tabindex: panel.getAttribute("tabindex"),
						hasControl: panel.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])') !== null,
					};
				}),
			};
		}),
	);
}

function assertEveryStaticPanelReadable(blocks) {
	assert.equal(blocks.length, 3, "the hero preview, 03 markets and 04 features");
	for (const block of blocks) {
		assert.equal(block.listShown, false, "the tab list is hidden when it cannot switch panels");
		for (const panel of block.panels) {
			if (panel.requiresJs) {
				assert.equal(panel.shown, false, `${panel.id} needs JavaScript and stays hidden`);
				continue;
			}
			assert.equal(panel.shown, true, `${panel.id} is visible`);
			assert.ok(panel.text.length > 0, `${panel.id} has readable text`);
			if (panel.heading) assert.ok(panel.text.includes(panel.heading), `${panel.id} shows its own heading`);
		}
	}
	const markets = blocks[1].panels;
	assert.ok(markets.length >= 6 && markets.every((panel) => panel.shown), "every market category is readable");
}

test("without JavaScript every static tab panel is visible with its heading, and the tab lists are hidden", async () => {
	const { context, page } = await openPage(browser, "/", { viewport: DESKTOP, javaScriptEnabled: false });
	try {
		await page.goto("https://site.test/");
		assertEveryStaticPanelReadable(await readTabBlocks(page, { javaScript: false }));
		const marketHeadings = await page.locator("#markets [data-panel-heading]").evaluateAll((headings) =>
			headings.map((heading) => heading.checkVisibility() && heading.getBoundingClientRect().width > 1),
		);
		assert.ok(marketHeadings.length >= 6 && marketHeadings.every(Boolean), "each market panel names its category");
	} finally {
		await context.close();
	}
});

test("when the tab module fails to load, every static panel shows once the page has loaded", async () => {
	const { context, page } = await openPage(browser, "/", { viewport: DESKTOP, block: [/\/_astro\/tabs\.[\w-]+\.js$/] });
	try {
		await page.goto("https://site.test/", { waitUntil: "load" });
		assert.equal(await page.evaluate(() => document.documentElement.className.split(/\s+/).includes("js-loaded")), true);
		const blocks = await readTabBlocks(page);
		assert.ok(blocks.every((block) => !block.ready), "no block was wired");
		assertEveryStaticPanelReadable(blocks);
	} finally {
		await context.close();
	}
});

test("while the tab module is still loading, only the first panels show and the tab lists keep their space", async () => {
	const { context, page } = await openPage(browser, "/", { viewport: DESKTOP, delay: [/\/_astro\/tabs\.[\w-]+\.js$/], delayMs: 2_000 });
	try {
		await page.goto("https://site.test/", { waitUntil: "commit" });
		await page.waitForSelector("#features [data-tabpanel]", { state: "attached" });
		await page.waitForFunction(() => [...document.querySelectorAll('link[rel="stylesheet"]')].every((link) => link.sheet));
		const early = await page.evaluate(() =>
			[...document.querySelectorAll("[data-tabs]")].map((block) => ({
				ready: block.hasAttribute("data-tabs-ready"),
				listVisibility: getComputedStyle(block.querySelector("[data-tablist]")).visibility,
				listHeight: block.querySelector("[data-tablist]").getBoundingClientRect().height,
				shown: [...block.querySelectorAll("[data-tabpanel]")].map((panel) => getComputedStyle(panel).display !== "none"),
			})),
		);
		for (const block of early) {
			assert.equal(block.ready, false, "the module has not run yet");
			assert.equal(block.listVisibility, "hidden");
			assert.ok(block.listHeight > 0, "the tab list holds its height, so nothing moves when it appears");
			assert.deepEqual(block.shown, block.shown.map((_, index) => index === 0), "no flash of the other panels");
		}
		await page.waitForSelector("[data-tabs][data-tabs-ready]");
	} finally {
		await context.close();
	}
});

test("wired blocks show one panel, follow the list's real orientation and make text-only panels focusable", async () => {
	for (const [viewport, orientation] of [
		[DESKTOP, "vertical"],
		[PHONE, "horizontal"],
	]) {
		const { context, page } = await openPage(browser, "/", { viewport });
		try {
			await page.goto("https://site.test/", { waitUntil: "load" });
			const blocks = await readTabBlocks(page);
			for (const [index, block] of blocks.entries()) {
				assert.equal(block.ready, true, `block ${index} at ${viewport.width}px is wired`);
				assert.equal(block.listShown, true, `block ${index} at ${viewport.width}px shows its tab list`);
				assert.equal(block.panels.filter((panel) => panel.shown).length, 1, "one panel at a time");
				assert.equal(block.orientation, block.flexDirection.startsWith("column") ? "vertical" : "horizontal");
				for (const panel of block.panels) {
					if (!panel.hasControl) assert.equal(panel.tabindex, "0", `${panel.id} has no control of its own, so it takes focus`);
				}
			}
			assert.equal(blocks[2].orientation, orientation, `features at ${viewport.width}px`);

			await page.evaluate(() => {
				window.__prevented = [];
				document.addEventListener("keydown", (event) => window.__prevented.push(event.defaultPrevented));
			});
			await page.locator("#feature-tab-language").focus();
			await page.keyboard.press("ArrowDown");
			const afterDown = await page.evaluate(() => ({
				selected: document.querySelector('#features [aria-selected="true"]').id,
				prevented: window.__prevented.at(-1),
			}));
			if (orientation === "vertical") {
				assert.deepEqual(afterDown, { selected: "feature-tab-email", prevented: true });
			} else {
				assert.deepEqual(afterDown, { selected: "feature-tab-language", prevented: false }, "a row leaves Up/Down to the page");
				await page.keyboard.press("ArrowRight");
				assert.equal(await page.evaluate(() => document.querySelector('#features [aria-selected="true"]').id), "feature-tab-email");
			}
			// The cross-fading features block shows its panels with `visibility`, which the reduced-motion context's
			// 0.01ms transitions hold for a frame (see readTabBlocks).
			await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
			await page.keyboard.press("Tab");
			assert.equal(await page.evaluate(() => document.activeElement.id), "feature-panel-email", "Tab moves from the tab into its panel");
		} finally {
			await context.close();
		}
	}
});

// 2026-10-27, operator report "the features switch stutters": the whole panel used to fade from opacity 0, so the
// dark window flashed grey on every switch, each screenshot was fetched only on its first click, and panels with
// a one-line description were 24px shorter than the others. Now the dark stage stays opaque, the leaving figure
// fades over the selected one, the screenshots are decoded before the block scrolls into view and the block keeps
// one height.
test("the features block cross-fades its screenshots over an opaque stage, with preloaded images and one height", async () => {
	const { context, page } = await openPage(browser, "/", { viewport: DESKTOP, reducedMotion: "no-preference" });
	try {
		await page.goto("https://site.test/", { waitUntil: "load" });
		await page.locator("#features").scrollIntoViewIfNeeded();
		await page.waitForFunction(() =>
			[...document.querySelectorAll("#features [data-tabpanel] img")].every((image) => image.complete && image.naturalWidth > 0),
		);
		const ids = await page.evaluate(() => [...document.querySelectorAll("#features [role=tab]")].map((tab) => tab.id));
		const block = page.locator("#features [data-tab-panels]");
		const height = (await block.boundingBox()).height;
		for (const id of [...ids.slice(1), ids[0]]) {
			const frames = await page.evaluate(async (tabId) => {
				const root = document.querySelector("#features [data-tabs]");
				const target = document.getElementById(document.getElementById(tabId).getAttribute("aria-controls"));
				const samples = [];
				document.getElementById(tabId).click();
				const start = performance.now();
				await new Promise((done) => {
					const sample = () => {
						const visible = [...root.querySelectorAll("[data-tabpanel]")].filter((panel) => getComputedStyle(panel).visibility === "visible");
						samples.push({
							activeFigure: getComputedStyle(target.querySelector("figure")).opacity,
							activeStage: getComputedStyle(target).opacity,
							visible: visible.length,
							height: root.querySelector("[data-tab-panels]").getBoundingClientRect().height,
						});
						if (performance.now() - start < 700) requestAnimationFrame(sample);
						else done();
					};
					requestAnimationFrame(sample);
				});
				return samples;
			}, id);
			assert.ok(frames.length > 10, "sampled the switch frame by frame");
			for (const frame of frames) {
				assert.equal(frame.activeStage, "1", `${id}: the selected panel never fades as a whole`);
				assert.equal(frame.activeFigure, "1", `${id}: the selected screenshot sits opaque under the leaving one`);
				assert.ok(frame.visible <= 2, `${id}: at most the selected and the leaving panel are drawn`);
				assert.equal(frame.height, height, `${id}: the block keeps one height`);
			}
			assert.ok(frames.some((frame) => frame.visible === 2), `${id}: the previous screenshot fades out over the new one`);
			assert.equal(frames.at(-1).visible, 1, `${id}: the leaving panel is gone once its fade ends`);
		}
	} finally {
		await context.close();
	}
});
