import { expect, type Locator, type Page, test } from "@playwright/test";

const feedbackSelector = "[data-order-feedback]";
const viewports = [
	{ width: 1280, height: 900 },
	{ width: 1000, height: 900 },
	{ width: 800, height: 900 },
	{ width: 390, height: 844 },
];

async function expectReadableCopy(locator: Locator, expected: string) {
	await expect.poll(async () => (await locator.textContent())?.replace(/[\u2066-\u2069]/gu, "")).toBe(expected);
}

async function waitForInitialFeedback(feedback: Locator) {
	await expect(feedback).toHaveCount(1, { timeout: 15_000 });
}

async function expectContainedFeedback(feedback: Locator, viewport: { width: number; height: number }) {
	await expect(async () => {
		const card = await feedback.boundingBox();
		expect(card).not.toBeNull();
		if (!card) return;
		expect(card.x).toBeGreaterThanOrEqual(15);
		expect(card.y).toBeGreaterThanOrEqual(15);
		expect(card.x + card.width).toBeLessThanOrEqual(viewport.width - 15);
		expect(card.y + card.height).toBeLessThanOrEqual(viewport.height - (viewport.width <= 1000 ? 67 : 23));
		const close = await feedback.getByRole("button").boundingBox();
		expect(close).not.toBeNull();
		if (!close) return;
		expect(close.width).toBeGreaterThanOrEqual(24);
		expect(close.height).toBeGreaterThanOrEqual(24);
		expect(close.x + close.width).toBeLessThanOrEqual(card.x + card.width);
		expect(close.y + close.height).toBeLessThanOrEqual(card.y + card.height);
		expect(await feedback.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
		for (const text of await feedback.locator("[data-order-summary], [data-order-detail]").all()) {
			const box = await text.boundingBox();
			expect(box).not.toBeNull();
			if (!box) continue;
			expect(box.x + box.width).toBeLessThanOrEqual(close.x);
			expect(
				await text.evaluate((element) => {
					const style = getComputedStyle(element);
					return (
						element.scrollWidth <= element.clientWidth &&
						element.scrollHeight <= element.clientHeight &&
						style.textOverflow !== "ellipsis" &&
						(style.webkitLineClamp === "none" || style.webkitLineClamp === "")
					);
				}),
			).toBe(true);
		}
	}).toPass();
}

async function observeActiveCards(page: Page) {
	await page.evaluate(() => {
		const observations = { maximum: 0 };
		Object.assign(window, { notificationObservations: observations });
		const observer = new MutationObserver(() => {
			const active = document.querySelectorAll('[data-sonner-toast]:not([data-removed="true"]) [data-order-feedback]');
			observations.maximum = Math.max(observations.maximum, active.length);
		});
		observer.observe(document.body, { childList: true, subtree: true, attributes: true });
	});
}

async function maximumActiveCards(page: Page) {
	return page.evaluate(() => {
		const observations: unknown = Reflect.get(window, "notificationObservations");
		if (
			!observations ||
			typeof observations !== "object" ||
			!("maximum" in observations) ||
			typeof observations.maximum !== "number"
		) {
			throw new Error("Notification observations are missing");
		}
		return observations.maximum;
	});
}

test.beforeEach(async ({ page }) => {
	await page.goto("/notifications.html");
	await expect(page.getByRole("heading", { name: "Notification fixture" })).toBeVisible();
});

test("updates one card in place across repeated lazy host mounts under StrictMode", async ({ page }) => {
	await observeActiveCards(page);
	for (let attempt = 0; attempt < 2; attempt += 1) {
		await page.getByRole("button", { name: "Submit synthetic order" }).click();
		const feedback = page.locator(feedbackSelector);
		await waitForInitialFeedback(feedback);
		await expect(feedback).toContainText("Submitting");
		await expect(page.locator("[data-sonner-toaster]")).toHaveCount(1);
		const original = await feedback.elementHandle();
		expect(original).not.toBeNull();
		await page.getByRole("button", { name: "Fill synthetic order" }).click();
		await expect(feedback).toHaveCount(1);
		await expect(feedback).toContainText("HYPE order filled");
		expect(await feedback.evaluate((element, initial) => element === initial, original)).toBe(true);
		await expect(feedback).toHaveCount(0, { timeout: 8_000 });
		await expect(page.getByRole("status", { name: "Queued tasks" })).toHaveText("0");
	}
	expect(await maximumActiveCards(page)).toBe(1);
	await expect(page.locator("[data-sonner-toaster]")).toHaveCount(0);
});

test("keeps a late result when the previous pending card exits", async ({ page }) => {
	await page.getByRole("button", { name: "Submit synthetic order" }).click();
	const feedback = page.locator(feedbackSelector);
	await waitForInitialFeedback(feedback);
	await expect(feedback).toContainText("Submitting");
	const taskId = await feedback.getAttribute("data-order-feedback");
	await feedback.getByRole("button", { name: "Dismiss", exact: true }).click();
	await expect(page.getByRole("status", { name: "Queued tasks" })).toHaveText("1");
	await page.getByRole("button", { name: "Fill synthetic order" }).click();
	await expect(feedback).toHaveCount(1);
	await expect(feedback).toHaveAttribute("data-order-feedback", taskId ?? "");
	await expect(feedback).toContainText("HYPE order filled");
	await page.waitForTimeout(750);
	await expect(feedback).toHaveCount(1);
	await expect(feedback).toContainText("HYPE order filled");
	await expect(feedback).not.toContainText("Submitting");
	await expect(page.getByRole("status", { name: "Queued tasks" })).toHaveText("1");
});

test("hides the initiating account's card and restores its current result", async ({ page }) => {
	await page.getByRole("button", { name: "Submit synthetic order" }).click();
	const feedback = page.locator(feedbackSelector);
	await waitForInitialFeedback(feedback);
	await expect(feedback).toContainText("Submitting");
	await page.getByRole("button", { name: "Switch account" }).click();
	await expect(feedback).toHaveCount(0);
	await page.getByRole("button", { name: "Switch account" }).click();
	await expect(feedback).toHaveCount(1);
	await page.getByRole("button", { name: "Fill synthetic order" }).click();
	await expect(feedback).toContainText("HYPE order filled");
	await page.waitForTimeout(750);
	await expect(feedback).toHaveCount(1);
});

for (const viewport of viewports) {
	test(`shares the Sonner stack within the ${viewport.width}px viewport in both themes`, async ({ page }, testInfo) => {
		await page.setViewportSize(viewport);
		await page.getByRole("button", { name: "Start task", exact: true }).click();
		const feedback = page.locator(feedbackSelector);
		await waitForInitialFeedback(feedback);
		await expect(feedback).toContainText("Close All Positions");
		await page.getByRole("button", { name: "Ordinary notice", exact: true }).click();
		await expect(page.locator("[data-sonner-toaster]")).toHaveCount(1);
		await expect(page.locator("[data-sonner-toast]")).toHaveCount(2);
		await expect(page.getByText("Ordinary notification", { exact: true })).toBeVisible();
		for (let theme = 0; theme < 2; theme += 1) {
			await page.getByRole("button", { name: "Switch theme" }).click();
			await page.getByText("Ordinary notification", { exact: true }).hover();
			await expect(page.locator('[data-sonner-toast][data-expanded="true"]')).toHaveCount(2);
			const notices = page.locator("[data-sonner-toast]");
			await expect(async () => {
				for (const notice of await notices.all()) {
					const box = await notice.boundingBox();
					expect(box).not.toBeNull();
					if (!box) continue;
					expect(box.x).toBeGreaterThanOrEqual(15);
					expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 15);
					expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - (viewport.width <= 1000 ? 67 : 23));
				}
			}).toPass();
			await page.screenshot({
				path: testInfo.outputPath(`notification-stack-theme-${theme}.png`),
				animations: "disabled",
			});
		}
		await page.getByRole("button", { name: "Switch route" }).click();
		await expect(feedback).toHaveCount(1);
	});

	test(`keeps verified fill copy compact and reactive at ${viewport.width}px in both themes`, async ({
		page,
	}, testInfo) => {
		await page.setViewportSize(viewport);
		await page.getByRole("button", { name: "Verified synthetic fill", exact: true }).click();
		const feedback = page.locator(feedbackSelector);
		await waitForInitialFeedback(feedback);
		const original = await feedback.elementHandle();
		const taskId = await feedback.getAttribute("data-order-feedback");
		for (let theme = 0; theme < 2; theme += 1) {
			await page.getByRole("button", { name: "Switch theme" }).click();
			for (const locale of ["English", "Chinese"]) {
				await page.getByRole("button", { name: locale, exact: true }).click();
				await feedback.hover();
				await expectReadableCopy(
					feedback.locator("[data-order-summary]"),
					locale === "English" ? "Bought 1.25 HYPE" : "已买入 1.25 HYPE",
				);
				await expectReadableCopy(
					feedback.locator("[data-order-detail]"),
					locale === "English" ? "Avg. $101.125" : "均价 $101.125",
				);
				await expect(feedback).not.toContainText("111");
				await expect(feedback).not.toContainText("Size:");
				await expect(feedback).toHaveAttribute("data-order-feedback", taskId ?? "");
				expect(await feedback.evaluate((element, initial) => element === initial, original)).toBe(true);
				await expect(page.locator("[data-sonner-toaster]")).toHaveCount(1);
				await expect(feedback.locator("[data-order-scroll]")).not.toHaveAttribute("tabindex");
				await page.locator("[data-sonner-toast]").focus();
				await page.keyboard.press("Tab");
				await expect(feedback.getByRole("button")).toBeFocused();
				await expect(page.getByRole("status", { name: "Queued tasks" })).toHaveText("1");
				await expectContainedFeedback(feedback, viewport);
				const contentHeight = await feedback.evaluate((element) => {
					const copy = [...element.querySelectorAll("[data-order-summary], [data-order-detail]")];
					const top = Math.min(...copy.map((entry) => entry.getBoundingClientRect().top));
					const bottom = Math.max(...copy.map((entry) => entry.getBoundingClientRect().bottom));
					const lineHeight = Math.max(...copy.map((entry) => Number.parseFloat(getComputedStyle(entry).lineHeight)));
					return { height: bottom - top, twoLines: lineHeight * 2 + 4 };
				});
				expect(contentHeight.height).toBeLessThanOrEqual(contentHeight.twoLines);
				await page.screenshot({
					path: testInfo.outputPath(`compact-fill-${theme}-${locale}.png`),
					animations: "disabled",
				});
			}
		}
		await feedback.getByRole("button").click();
		await expect(feedback).toHaveCount(0);
		await expect(page.getByRole("status", { name: "Queued tasks" })).toHaveText("0");
	});

	test(`wraps long markets and rejection details without covering controls at ${viewport.width}px`, async ({
		page,
	}, testInfo) => {
		await page.setViewportSize(viewport);
		for (let theme = 0; theme < 2; theme += 1) {
			await page.getByRole("button", { name: "Switch theme" }).click();
			for (const scenario of ["Long market fill", "Long rejection", "Twenty rejections"]) {
				await page.getByRole("button", { name: scenario, exact: true }).click();
				const feedback = page.locator(feedbackSelector);
				await waitForInitialFeedback(feedback);
				await feedback.hover();
				await expect(feedback).toContainText("SYNTHETICMARKETWITHANUNBROKENLONGSYMBOL");
				if (scenario === "Long rejection") {
					await expect(feedback.getByRole("alert")).toContainText(
						"SYNTHETICREFERENCEWITHANUNBROKENLONGIDENTIFIER. Review the order details before trying again.",
					);
				}
				if (scenario === "Twenty rejections") {
					const body = feedback.locator('[data-order-scroll="body"]');
					for (let index = 1; index <= 20; index += 1) {
						await expect(body).toContainText(`Synthetic rejection ${index}:`);
					}
					expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
					await expect(feedback.locator("[data-order-summary]")).toBeInViewport();
					await body.focus();
					await body.press("End");
					await expect
						.poll(() =>
							body.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1),
						)
						.toBe(true);
					await expect(feedback.getByRole("button")).toBeInViewport();
				}
				await expectContainedFeedback(feedback, viewport);
				await page.screenshot({
					path: testInfo.outputPath(`long-copy-${theme}-${scenario.replaceAll(" ", "-")}.png`),
					animations: "disabled",
				});
				await feedback.getByRole("button").click();
				await expect(feedback).toHaveCount(0);
				await expect(page.getByRole("status", { name: "Queued tasks" })).toHaveText("0");
			}
		}
	});
}

test("updates number preferences in an existing compiled notification", async ({ page }) => {
	await page.getByRole("button", { name: "Verified synthetic fill", exact: true }).click();
	const feedback = page.locator(feedbackSelector);
	await waitForInitialFeedback(feedback);
	const original = await feedback.elementHandle();
	const taskId = await feedback.getAttribute("data-order-feedback");
	await expectReadableCopy(feedback.locator("[data-order-detail]"), "Avg. $101.125");
	await page.getByRole("button", { name: "German numbers", exact: true }).click();
	await expectReadableCopy(feedback.locator("[data-order-detail]"), "Avg. $101,125");
	await page.getByRole("button", { name: "Chinese", exact: true }).click();
	await expectReadableCopy(feedback.locator("[data-order-detail]"), "均价 $101,125");
	await page.getByRole("button", { name: "English numbers", exact: true }).click();
	await expectReadableCopy(feedback.locator("[data-order-detail]"), "均价 $101.125");
	await expect(feedback).toHaveAttribute("data-order-feedback", taskId ?? "");
	expect(await feedback.evaluate((element, initial) => element === initial, original)).toBe(true);
	await expect(page.getByRole("status", { name: "Queued tasks" })).toHaveText("1");
});

test("removes the extra tab stop when an overflowing notice becomes a short result", async ({ page }) => {
	await page.getByRole("button", { name: "Twenty rejections", exact: true }).click();
	const feedback = page.locator(feedbackSelector);
	await waitForInitialFeedback(feedback);
	await feedback.hover();
	const original = await feedback.elementHandle();
	const body = feedback.locator('[data-order-scroll="body"]');
	await expect(body).toHaveAttribute("tabindex", "0");
	await page.locator("[data-sonner-toast]").focus();
	await page.keyboard.press("Tab");
	await expect(body).toBeFocused();
	await body.press("End");
	await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
	await page.getByRole("button", { name: "Fill synthetic order", exact: true }).click();
	await expect(feedback.getByRole("status")).toContainText("order filled");
	await expect(body).not.toHaveAttribute("tabindex");
	expect(await feedback.evaluate((element, initial) => element === initial, original)).toBe(true);
	await page.locator("[data-sonner-toast]").focus();
	await page.keyboard.press("Tab");
	await expect(feedback.getByRole("button")).toBeFocused();
});

test("keeps combined batch errors and child results reachable in a short mobile viewport", async ({
	page,
}, testInfo) => {
	const viewport = { width: 800, height: 360 };
	await page.setViewportSize(viewport);
	await page.getByRole("button", { name: "Twenty rejections with children", exact: true }).click();
	const feedback = page.locator(feedbackSelector);
	await waitForInitialFeedback(feedback);
	await feedback.hover();
	await expectContainedFeedback(feedback, viewport);
	const body = feedback.locator('[data-order-scroll="body"]');
	const children = feedback.getByRole("region", { name: "Order results" });
	await expect(children.getByRole("listitem")).toHaveCount(20);
	for (const region of [body, children]) {
		expect(await region.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
	}
	await body.focus();
	await body.press("End");
	await expect
		.poll(() => body.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1))
		.toBe(true);
	await body.press("Tab");
	await expect(feedback.getByRole("button")).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(children).toBeFocused();
	await children.press("End");
	await expect
		.poll(() => children.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1))
		.toBe(true);
	await expect(feedback.getByRole("button")).toBeInViewport({ ratio: 1 });
	await expectContainedFeedback(feedback, viewport);
	await page.screenshot({ path: testInfo.outputPath("short-combined-results.png"), animations: "disabled" });
	await feedback.getByRole("button").click();
	await expect(feedback).toHaveCount(0);
});

test.describe("touch scrolling", () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test("scrolls error details without dismissing the card", async ({ page, context }, testInfo) => {
		await page.getByRole("button", { name: "Twenty rejections", exact: true }).click();
		const feedback = page.locator(feedbackSelector);
		await waitForInitialFeedback(feedback);
		await feedback.getByRole("button").hover();
		const body = feedback.locator('[data-order-scroll="body"]');
		const box = await body.boundingBox();
		expect(box).not.toBeNull();
		if (!box) throw new Error("Scrollable feedback body is missing");
		const x = box.x + box.width / 2;
		const y = box.y + box.height - 25;
		const cdp = await context.newCDPSession(page);
		await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
		for (let step = 1; step <= 10; step += 1) {
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [{ x, y: y - step * 18, id: 1 }],
			});
			await page.waitForTimeout(20);
		}
		await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
		await expect(feedback).toHaveCount(1);
		await expect(page.getByRole("status", { name: "Queued tasks" })).toHaveText("1");
		await expectContainedFeedback(feedback, { width: 390, height: 844 });
		await page.screenshot({ path: testInfo.outputPath("touch-scrolled-errors.png"), animations: "disabled" });
		await feedback.getByRole("button").click();
		await expect(feedback).toHaveCount(0);
		await expect(page.getByRole("status", { name: "Queued tasks" })).toHaveText("0");
	});
});
