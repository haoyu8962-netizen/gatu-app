// Narrow phones (320, 360 and 390px) in headless Chromium on the built page: the hero's calls to action, every
// 03 market category with the longest numbers the live script can write, and the 404 page. Nothing may be clipped
// or scroll the page sideways (WCAG 1.4.10 Reflow). The live numbers are written into the real slots with the
// classes src/scripts/live-markets.ts uses, so the check does not depend on Hyperliquid's API.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { launch, openPage } from "./browser.mjs";

const WIDTHS = [320, 360, 390];

let browser;
before(async () => {
	browser = await launch();
});
after(async () => {
	await browser?.close();
});

/** Elements (by label) whose box leaves `container`, or whose own content is wider than their box. */
function overflowProblems(page, containerSelector, itemSelector) {
	return page.evaluate(
		([containerSelector, itemSelector]) => {
			const container = document.querySelector(containerSelector).getBoundingClientRect();
			const problems = [];
			if (document.documentElement.scrollWidth > document.documentElement.clientWidth) {
				problems.push(`page scrolls sideways: ${document.documentElement.scrollWidth} > ${document.documentElement.clientWidth}`);
			}
			for (const item of document.querySelectorAll(itemSelector)) {
				if (!item.checkVisibility()) continue;
				const box = item.getBoundingClientRect();
				const label = item.textContent.replace(/\s+/g, " ").trim().slice(0, 40);
				if (box.left < container.left - 0.5 || box.right > container.right + 0.5) problems.push(`${label}: outside its container`);
				if (item.scrollWidth > item.clientWidth + 1) problems.push(`${label}: content ${item.scrollWidth} > box ${item.clientWidth}`);
			}
			return problems;
		},
		[containerSelector, itemSelector],
	);
}

test("the hero's calls to action fit at 320, 360 and 390px, stacking when two do not fit side by side", async () => {
	for (const width of WIDTHS) {
		const { context, page } = await openPage(browser, "/", { viewport: { width, height: 844 } });
		try {
			await page.goto("https://site.test/", { waitUntil: "load" });
			assert.deepEqual(await overflowProblems(page, "main", "section[aria-labelledby='hero-title'] .btn"), [], `${width}px`);
		} finally {
			await context.close();
		}
	}
});

test("every 03 category fits its panel at 320, 360 and 390px with the longest live numbers", async () => {
	for (const width of WIDTHS) {
		const { context, page } = await openPage(browser, "/", { viewport: { width, height: 844 } });
		try {
			await page.goto("https://site.test/", { waitUntil: "load" });
			const tabs = await page.locator('#markets [role="tab"]').all();
			assert.ok(tabs.length >= 6);
			for (const tab of tabs) {
				await tab.click();
				const name = (await tab.innerText()).replace(/\s+\d+$/, "");
				// The widest values each slot can hold: an implied valuation over a trillion with its unit label, a mark price
				// past 100,000 and a four-digit 24h change. Written synchronously, so the live script cannot clear them first.
				const problems = await page.evaluate(() => {
					const box = document.querySelector("#markets [data-live-region]");
					const panel = box.querySelector("[data-tabpanel]:not([hidden])");
					for (const row of panel.querySelectorAll("[data-live-row]")) {
						const primary = row.querySelector("[data-live-primary]");
						const label = document.createElement("span");
						label.className = "block font-sans text-xs font-normal text-fg-subtle";
						label.textContent = "implied valuation";
						primary.replaceChildren("US$1,234.56T", label);
						row.querySelector("[data-live-secondary]").textContent = "Mark $123,456.78";
						row.querySelector("[data-live-change]").textContent = "-1,234.56% ▼";
					}
					const container = box.getBoundingClientRect();
					const found = [];
					if (box.scrollWidth > box.clientWidth) found.push(`panel scrolls: ${box.scrollWidth} > ${box.clientWidth}`);
					const table = panel.querySelector("table");
					if (table.scrollWidth > panel.clientWidth) found.push(`table ${table.scrollWidth} > panel ${panel.clientWidth}`);
					for (const row of panel.querySelectorAll("[data-live-row]")) {
						const coin = row.dataset.liveRow;
						for (const cell of row.querySelectorAll("td")) {
							if (cell.checkVisibility() && cell.scrollWidth > cell.clientWidth + 1) found.push(`${coin}: a cell overflows (${cell.scrollWidth} > ${cell.clientWidth})`);
						}
						const trade = row.querySelector(".btn").getBoundingClientRect();
						if (trade.left < container.left - 0.5 || trade.right > container.right + 0.5) found.push(`${coin}: Trade is clipped`);
					}
					if (document.documentElement.scrollWidth > document.documentElement.clientWidth) found.push("page scrolls sideways");
					return found;
				});
				assert.deepEqual(problems, [], `${name} at ${width}px`);
			}
		} finally {
			await context.close();
		}
	}
});

test("the 404 page's two buttons fit at 320, 360 and 390px", async () => {
	for (const width of WIDTHS) {
		const { context, page } = await openPage(browser, "/404.html", { viewport: { width, height: 700 } });
		try {
			await page.goto("https://site.test/404.html", { waitUntil: "load" });
			assert.deepEqual(await overflowProblems(page, "main", "main .btn"), [], `${width}px`);
		} finally {
			await context.close();
		}
	}
});
