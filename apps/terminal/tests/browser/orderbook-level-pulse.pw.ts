import { expect, type Page, test } from "@playwright/test";

const pulseSelector = '[data-slot="orderbook-level-pulse"]';
const quantityFeedbackSelector = '[data-slot="orderbook-size-value"].orderbook-color-change';
const fixtures = [
	{ name: "wide desktop", view: "desktop", width: 280, height: 677, viewport: { width: 1661, height: 1265 } },
	{ name: "medium desktop", view: "desktop", width: 350, height: 670, viewport: { width: 1238, height: 1305 } },
	{ name: "desktop breakpoint", view: "desktop", width: 282, height: 577, viewport: { width: 1001, height: 844 } },
	{ name: "mobile breakpoint", view: "split", width: 390, height: 425.5, viewport: { width: 1000, height: 844 } },
	{ name: "mobile split", view: "split", width: 390, height: 425, viewport: { width: 390, height: 844 } },
	{
		name: "compact both",
		view: "compact",
		mode: "both",
		width: 164,
		height: 425,
		viewport: { width: 390, height: 844 },
	},
	{
		name: "compact asks",
		view: "compact",
		mode: "asks",
		width: 164,
		height: 425,
		viewport: { width: 390, height: 844 },
	},
	{
		name: "compact bids",
		view: "compact",
		mode: "bids",
		width: 164,
		height: 425,
		viewport: { width: 390, height: 844 },
	},
] as const;

async function openFixture(page: Page, view: "desktop" | "compact" | "split", width = 280, height = 677) {
	await page.goto("/orderbook-level-pulse.html");
	await page.waitForFunction(() => typeof window.configureOrderbookPulse === "function");
	await page.evaluate((options) => window.configureOrderbookPulse(options), { view, width, height });
	await page.evaluate(() => window.publishOrderbookPulseSnapshot());
	await expect(page.locator('button[aria-label*="99"]:enabled').first()).toBeVisible();
	await expect(page.locator(pulseSelector)).toHaveCount(0);
}

async function geometry(page: Page) {
	return page.locator('[data-slot="pulse-fixture-panel"], [data-slot="pulse-fixture-footer"]').evaluateAll((elements) =>
		elements.map((element) => {
			const { x, y, width, height } = element.getBoundingClientRect();
			return { x, y, width, height };
		}),
	);
}

for (const view of ["desktop", "compact", "split"] as const) {
	test(`${view} cancels both animation layers through the persisted setting without remounting rows`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: view === "desktop" ? 1661 : 390, height: 844 });
		await openFixture(page, view, view === "compact" ? 164 : 390, 425);
		const toggle = page.getByRole("checkbox", { name: "Animate order book" });
		await expect(toggle).toBeChecked();
		const before = await geometry(page);
		const retained = page.locator('button[aria-label*="Use 99."]').first();
		await retained.evaluate((element) => element.setAttribute("data-fixture-setting-row", "retained"));
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.5", bid: "99.5", size: "2" }));
		await expect(page.locator(pulseSelector)).toHaveCount(2);
		if (view !== "split") await expect(page.locator(quantityFeedbackSelector).first()).toBeVisible();
		await toggle.uncheck();
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await expect(page.locator(quantityFeedbackSelector)).toHaveCount(0);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.25", bid: "99.75", size: "3" }));
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await expect(page.locator(quantityFeedbackSelector)).toHaveCount(0);
		await toggle.check();
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await expect(page.locator(quantityFeedbackSelector)).toHaveCount(0);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.25", bid: "99.75", size: "3" }));
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await expect(page.locator(quantityFeedbackSelector)).toHaveCount(0);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.2", bid: "99.8", size: "4" }));
		await expect(page.locator(pulseSelector)).toHaveCount(2);
		if (view === "split") await expect(page.locator(quantityFeedbackSelector)).toHaveCount(0);
		else await expect(page.locator(quantityFeedbackSelector).first()).toBeVisible();
		await expect(page.locator('[data-fixture-setting-row="retained"]')).toHaveCount(1);
		expect(await geometry(page)).toEqual(before);
		await page.emulateMedia({ reducedMotion: "reduce" });
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await expect(page.locator(quantityFeedbackSelector)).toHaveCount(0);
		await toggle.uncheck();
		await toggle.check();
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.1", bid: "99.9", size: "5" }));
		await expect(toggle).toBeChecked();
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await expect(page.locator(quantityFeedbackSelector)).toHaveCount(0);
	});
}

test("keeps the disabled animation preference after a reload and layout changes", async ({ page }) => {
	await openFixture(page, "desktop");
	await page.getByRole("checkbox", { name: "Animate order book" }).uncheck();
	await page.reload();
	await page.waitForFunction(() => typeof window.configureOrderbookPulse === "function");
	await expect(page.getByRole("checkbox", { name: "Animate order book" })).not.toBeChecked();
	for (const view of ["desktop", "compact", "split"] as const) {
		await page.evaluate(
			(view) => window.configureOrderbookPulse({ view, width: view === "compact" ? 164 : 390 }),
			view,
		);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot());
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.5", bid: "99.5", size: "2" }));
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await expect(page.locator(quantityFeedbackSelector)).toHaveCount(0);
	}
});

for (const view of ["desktop", "compact"] as const) {
	test(`${view} preserves the quantity fade through quote and presentation rerenders and restarts on numeric changes`, async ({
		page,
	}) => {
		await openFixture(page, view, view === "compact" ? 164 : 390, 425);
		await page
			.locator('button[aria-label*="Use 99."]')
			.first()
			.evaluate((element) => element.setAttribute("data-fixture-quantity-row", "retained"));
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ size: "2" }));
		const quantity = page
			.locator('[data-fixture-quantity-row="retained"]')
			.locator('[data-slot="orderbook-size-value"]');
		await expect(quantity).toHaveAttribute("data-direction", "up");
		const first = await quantity.evaluate(async (element) => {
			element.setAttribute("data-fixture-quantity", "retained");
			const animation = element.getAnimations()[0];
			if (!animation) throw new Error("Missing quantity animation");
			await animation.ready;
			return { startTime: animation.startTime, duration: animation.effect?.getTiming().duration };
		});
		expect(first.duration).toBe(1800);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ size: "2.0" }));
		await page.evaluate(() => window.setOrderbookPulsePresentation("light", "zh", true));
		const retained = page.locator('[data-fixture-quantity="retained"]');
		await expect(retained).toHaveCount(1);
		await expect(retained).toHaveAttribute("data-direction", "up");
		expect(await retained.evaluate((element) => element.getAnimations()[0]?.startTime)).toBe(first.startTime);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ size: "3" }));
		const updated = page
			.locator('[data-fixture-quantity-row="retained"]')
			.locator('[data-slot="orderbook-size-value"]');
		await expect(updated).toHaveAttribute("data-direction", "up");
		const restarted = await updated.evaluate(async (element) => {
			const animation = element.getAnimations()[0];
			if (!animation) throw new Error("Missing restarted quantity animation");
			await animation.ready;
			return animation.startTime;
		});
		expect(restarted).not.toBe(first.startTime);
		await updated.evaluate(async (element) => {
			const animation = element.getAnimations()[0];
			if (!animation) throw new Error("Missing quantity animation to finish");
			await animation.ready;
			animation.finish();
		});
		await expect(updated).not.toHaveClass(/orderbook-color-change/);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ size: "3" }));
		await expect(updated).not.toHaveClass(/orderbook-color-change/);
	});
}

for (const fixture of fixtures) {
	for (const theme of ["dark", "light"] as const) {
		test(`${fixture.name} ${theme} plays the same isolated full-row pulse without disturbing selection`, async ({
			page,
		}) => {
			await page.setViewportSize(fixture.viewport);
			await openFixture(page, fixture.view, fixture.width, fixture.height);
			await page.evaluate((theme) => window.setOrderbookPulsePresentation(theme, "en", false), theme);
			if ("mode" in fixture) await page.locator(`button[data-mode="${fixture.mode}"]`).click();
			await expect(page.locator(pulseSelector)).toHaveCount(0);
			const before = await geometry(page);
			const retained = page.locator('button[aria-label*="Use 101."]').first();
			const retainedBid = page.locator('button[aria-label*="Use 99."]').first();
			const retainedRow = "mode" in fixture && fixture.mode === "bids" ? retainedBid : retained;
			await retainedRow.focus();
			await retainedRow.evaluate((element) => element.setAttribute("data-fixture-retained", "true"));
			await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.5", bid: "99.5" }));
			const pulses = page.locator(pulseSelector);
			const expectedCount = "mode" in fixture && fixture.mode !== "both" ? 1 : 2;
			await expect(pulses).toHaveCount(expectedCount);
			const initial = await pulses.evaluateAll(async (elements) => {
				await Promise.all(elements.map((element) => element.getAnimations()[0]?.ready));
				return elements.map((element) => {
					const style = getComputedStyle(element);
					const animation = element.getAnimations()[0];
					const { x, y, width, height } = element.getBoundingClientRect();
					const row = element.closest("button");
					if (!row) throw new Error("Pulse must stay inside its price button");
					const rect = row.getBoundingClientRect();
					const target = document.elementFromPoint(x + width / 2, y + height / 2);
					return {
						id: element.getAttribute("data-event-id"),
						duration: animation?.effect?.getTiming().duration,
						iterations: animation?.effect?.getTiming().iterations,
						startTime: animation?.startTime,
						pointerEvents: style.pointerEvents,
						position: style.position,
						ariaHidden: element.getAttribute("aria-hidden"),
						matchesRow: [x - rect.x, y - rect.y, width - rect.width, height - rect.height].every(
							(value) => Math.abs(value) < 0.1,
						),
						clickPassesThrough: target?.closest("button") === row,
					};
				});
			});
			for (const pulse of initial) {
				expect(pulse.id).toBeTruthy();
				expect(pulse.duration).toBe(800);
				expect(pulse.iterations).toBe(1);
				expect(pulse.pointerEvents).toBe("none");
				expect(pulse.position).toBe("absolute");
				expect(pulse.ariaHidden).toBe("true");
				expect(pulse.matchesRow).toBe(true);
				expect(pulse.clickPassesThrough).toBe(true);
			}
			await page.evaluate(async () => {
				for (const size of ["2", "3", "2"]) {
					await new Promise((resolve) => setTimeout(resolve, 100));
					window.publishOrderbookPulseSnapshot({ ask: "100.5", bid: "99.5", size });
				}
			});
			const continuing = await pulses.evaluateAll((elements) =>
				elements.map((element) => ({
					id: element.getAttribute("data-event-id"),
					startTime: element.getAnimations()[0]?.startTime,
				})),
			);
			expect(continuing).toEqual(initial.map(({ id, startTime }) => ({ id, startTime })));
			await expect(page.locator('[data-fixture-retained="true"]')).toBeFocused();
			expect(await geometry(page)).toEqual(before);
			if (fixture.view === "split")
				await expect(page.locator('[data-slot^="split-orderbook-"] .orderbook-color-change')).toHaveCount(0);
			const price = "mode" in fixture && fixture.mode === "asks" ? "100.5" : "99.5";
			const interactive = page.locator(`button[aria-label*="Use ${price}"]`).first();
			await interactive.click();
			await expect.poll(() => page.evaluate(() => window.getOrderbookPulseSelectedPrice())).toBe(price);
			await interactive.focus();
			await interactive.press("Enter");
			await expect(interactive).toBeFocused();
			await expect(pulses).toHaveCount(0);
			await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.5", bid: "99.5", size: "4" }));
			await expect(pulses).toHaveCount(0);
		});
	}
}

for (const view of ["desktop", "compact", "split"] as const) {
	test(`${view} suppresses cache, failure recovery, empty recovery and presentation-only changes`, async ({ page }) => {
		await openFixture(page, view, view === "compact" ? 164 : 390, 425);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.5", bid: "99.5" }));
		await expect(page.locator(pulseSelector)).toHaveCount(2);
		await page.evaluate(() => window.setOrderbookPulseUnavailable("pending"));
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await expect(page.locator('button[aria-label*="as limit price"]:enabled')).toHaveCount(0);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.25", bid: "99.75" }));
		await expect(page.locator('button[aria-label*="as limit price"]:enabled').first()).toBeVisible();
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		for (const state of ["stale", "error"] as const) {
			await page.evaluate((state) => window.setOrderbookPulseUnavailable(state), state);
			await expect(page.locator('button[aria-label*="as limit price"]:enabled')).toHaveCount(0);
			await page.evaluate(() => window.publishOrderbookPulseSnapshot());
			await expect(page.locator('button[aria-label*="as limit price"]:enabled').first()).toBeVisible();
			await expect(page.locator(pulseSelector)).toHaveCount(0);
		}
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ empty: "both" }));
		await expect(page.locator('button[aria-label*="as limit price"]:enabled')).toHaveCount(0);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.5", bid: "99.5" }));
		await expect(page.locator('button[aria-label*="as limit price"]:enabled').first()).toBeVisible();
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		const retained = page.locator('button[aria-label*="Use 99."]').first();
		await retained.evaluate((element) => element.setAttribute("data-fixture-retained", "true"));
		await page.evaluate(() => window.configureOrderbookPulse({ height: 650.5 }));
		await page.evaluate(() => window.setOrderbookPulsePresentation("light", "zh", true));
		await expect(page.locator('[data-fixture-retained="true"]')).toHaveCount(1);
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await page.evaluate(() => window.setOrderbookPulsePresentation("dark", "en", false));
		await expect(page.locator('[data-fixture-retained="true"]')).toHaveCount(1);
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		if (view === "compact") {
			for (const mode of ["asks", "bids", "both"]) {
				await page.locator(`button[data-mode="${mode}"]`).click();
				await expect(page.locator(pulseSelector)).toHaveCount(0);
			}
			await page.evaluate(() =>
				window.publishOrderbookPulseSnapshot({ source: "l2Book-fast", ask: "100.25", bid: "99.75" }),
			);
			await expect(page.locator(pulseSelector)).toHaveCount(0);
		}
	});

	test(`${view} cancels and quietly resumes after reduced motion and hidden panels`, async ({ page }) => {
		await openFixture(page, view, view === "compact" ? 164 : 390, 425);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.5", bid: "99.5" }));
		await expect(page.locator(pulseSelector)).toHaveCount(2);
		await page.emulateMedia({ reducedMotion: "reduce" });
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.25", bid: "99.75" }));
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await page.emulateMedia({ reducedMotion: "no-preference" });
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.2", bid: "99.8" }));
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.15", bid: "99.85" }));
		await expect(page.locator(pulseSelector)).toHaveCount(2);
		if (view === "desktop") await page.getByRole("tab", { name: "Recent Trades", exact: true }).click();
		else await page.evaluate(() => window.configureOrderbookPulse({ active: false }));
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.1", bid: "99.9" }));
		if (view === "desktop") await page.getByRole("tab", { name: "Order Book", exact: true }).click();
		else await page.evaluate(() => window.configureOrderbookPulse({ active: true }));
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.05", bid: "99.95" }));
		await expect(page.locator(pulseSelector)).toHaveCount(2);
		await page.evaluate(() => {
			Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await expect(page.locator(pulseSelector)).toHaveCount(0);
		await page.evaluate(() => {
			window.publishOrderbookPulseSnapshot();
			Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await expect(page.locator(pulseSelector)).toHaveCount(0);
	});
}

for (const view of ["desktop", "compact", "split"] as const) {
	for (const theme of ["dark", "light"] as const) {
		test(`${view} ${theme} keeps keyboard focus and spread readable at the pulse peak`, async ({ page }, testInfo) => {
			await page.setViewportSize({ width: view === "desktop" ? 1661 : 390, height: 844 });
			await openFixture(page, view, view === "compact" ? 164 : 390, 425);
			await page.evaluate((theme) => window.setOrderbookPulsePresentation(theme, "en", false), theme);
			await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.5", bid: "99.5" }));
			await expect(page.locator(pulseSelector)).toHaveCount(2);
			await page.keyboard.press("Tab");
			const focusedRow = page.locator('button[aria-label*="Use 99.5"]').first();
			await focusedRow.focus();
			await page.locator(pulseSelector).evaluateAll(async (elements) => {
				for (const element of elements) {
					const animation = element.getAnimations()[0];
					if (!animation) throw new Error("Missing pulse animation");
					await animation.ready;
					animation.pause();
					animation.currentTime = Number(animation.effect?.getTiming().delay ?? 0) + 160;
				}
			});
			const focus = await focusedRow.evaluate((element) => {
				const style = getComputedStyle(element);
				const pulse = element.querySelector('[data-slot="orderbook-level-pulse"]');
				return {
					visible: element.matches(":focus-visible"),
					width: Number.parseFloat(style.outlineWidth),
					style: style.outlineStyle,
					color: style.outlineColor,
					opacity: pulse ? Number.parseFloat(getComputedStyle(pulse).opacity) : 0,
				};
			});
			expect(focus.visible).toBe(true);
			expect(focus.width).toBeGreaterThanOrEqual(2);
			expect(focus.style).toBe("solid");
			expect(focus.opacity).toBeCloseTo(0.7, 2);
			const screenshotPath = testInfo.outputPath(`${view}-${theme}-pulse-focus.png`);
			await page.screenshot({ path: screenshotPath, animations: "allow" });
			await testInfo.attach("focused-price-pulse-peak", { path: screenshotPath, contentType: "image/png" });
			if (view === "compact") {
				const contrast = await page.locator('[data-slot="compact-orderbook-mid-price"]').evaluate((element) => {
					const foreground = getComputedStyle(element).color;
					const parent = element.parentElement;
					if (!parent) throw new Error("Missing compact midpoint");
					const canvas = document.createElement("canvas");
					canvas.width = 1;
					canvas.height = 1;
					const context = canvas.getContext("2d");
					if (!context) throw new Error("Missing color conversion context");
					context.fillStyle = "white";
					context.fillRect(0, 0, 1, 1);
					const surfaces: Element[] = [];
					for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement)
						surfaces.unshift(ancestor);
					for (const surface of surfaces) {
						context.fillStyle = getComputedStyle(surface).backgroundColor;
						context.fillRect(0, 0, 1, 1);
					}
					const backgroundChannels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
					const background = `rgb(${backgroundChannels.join(", ")})`;
					function luminance(color: string) {
						if (!context) throw new Error("Missing color conversion context");
						context.clearRect(0, 0, 1, 1);
						context.fillStyle = color;
						context.fillRect(0, 0, 1, 1);
						const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
							const channel = value / 255;
							return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
						});
						return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
					}
					const values = [luminance(foreground), luminance(background)];
					return { foreground, background, ratio: (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05) };
				});
				expect(contrast.ratio, JSON.stringify(contrast)).toBeGreaterThanOrEqual(4.5);
				await testInfo.attach("compact-mid-price-contrast", {
					body: JSON.stringify(contrast),
					contentType: "application/json",
				});
			}
		});
	}
}

test.describe("touch price selection", () => {
	test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
	for (const view of ["compact", "split"] as const) {
		test(`${view} accepts a touch through the active pulse`, async ({ page }) => {
			await openFixture(page, view, view === "compact" ? 164 : 390, 425);
			await page.evaluate(() => window.publishOrderbookPulseSnapshot({ ask: "100.5", bid: "99.5" }));
			await expect(page.locator(pulseSelector)).toHaveCount(2);
			await page.locator('button[aria-label*="Use 99.5"]').first().tap();
			await expect.poll(() => page.evaluate(() => window.getOrderbookPulseSelectedPrice())).toBe("99.5");
		});
	}
});
