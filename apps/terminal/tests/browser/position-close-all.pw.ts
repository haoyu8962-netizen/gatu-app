import { expect, type Page, test } from "@playwright/test";
import Big from "big.js";

async function openConfirmation(page: Page) {
	await page.getByTestId("mobile-close-all-positions").click();
	await expect(page.getByRole("dialog")).toBeVisible();
}

async function confirm(page: Page) {
	await page.getByRole("dialog").getByRole("button", { name: "Close All Positions", exact: true }).click();
	await expect(page.getByRole("dialog")).toBeHidden();
}

for (const width of [320, 375, 390, 565, 1000]) {
	for (const locale of ["en", "zh", "fr"]) {
		test(`keeps mobile actions and confirmation usable at ${width}px in ${locale}`, async ({ page }, testInfo) => {
			await page.setViewportSize({ width, height: 871 });
			await page.goto(`/position-close-all.html?locale=${locale}`);
			const actions = page.getByTestId("mobile-position-actions");
			const button = page.getByTestId("mobile-close-all-positions");
			await expect(button).toBeEnabled();
			await expect(button).toHaveAccessibleName((await button.textContent())!.trim());
			const box = await actions.boundingBox();
			expect(box).not.toBeNull();
			expect(box!.x).toBeGreaterThanOrEqual(0);
			expect(box!.x + box!.width).toBeLessThanOrEqual(width);
			const overlap = await actions.evaluate((element) => {
				const buttons = Array.from(element.querySelectorAll("button"));
				const a = buttons[0].getBoundingClientRect();
				const b = buttons[1].getBoundingClientRect();
				return a.right > b.left;
			});
			expect(overlap).toBe(false);
			const filterOverlap = await page.getByTestId("position-filter-toolbar").evaluate((element) => {
				const buttons = Array.from(element.querySelectorAll("button"));
				return buttons[0].getBoundingClientRect().right > buttons[1].getBoundingClientRect().left;
			});
			expect(filterOverlap).toBe(false);
			await page.screenshot({ path: testInfo.outputPath("toolbar.png") });
			await openConfirmation(page);
			await expect(page.getByRole("dialog")).toContainText("HYPE");
			await expect(page.getByRole("dialog")).toContainText("xyz:TEST");
			await expect
				.poll(async () => {
					const bounds = await page.getByRole("dialog").boundingBox();
					return bounds ? bounds.y + bounds.height : Number.POSITIVE_INFINITY;
				})
				.toBeLessThanOrEqual(872);
			const dialogBox = await page.getByRole("dialog").boundingBox();
			expect(dialogBox!.x).toBeGreaterThanOrEqual(-1);
			expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(width + 1);
			expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(872);
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
			await expect(page.getByTestId("sent-orders")).toHaveText("[]");
			await page.screenshot({ path: testInfo.outputPath("confirmation.png") });
		});
	}
}

test("keeps the other locale action labels inside a narrow toolbar", async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 871 });
	for (const locale of ["ar", "es", "hi"]) {
		await page.goto(`/position-close-all.html?locale=${locale}`);
		const button = page.getByTestId("mobile-close-all-positions");
		await expect(button).toBeEnabled();
		const box = await button.boundingBox();
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(320);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
	}
});

test("opens the shared target confirmation from the desktop entry", async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 1001, height: 871 });
	await page.goto("/position-close-all.html");
	await page.getByTestId("positions-surface").getByRole("button", { name: "Close All Positions", exact: true }).click();
	await expect(page.getByRole("list", { name: "Positions to close" }).getByRole("listitem")).toHaveCount(2);
	await expect(page.getByRole("dialog")).toContainText("including positions hidden by filters");
	await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
	await expect
		.poll(async () => {
			const bounds = await page.getByRole("dialog").boundingBox();
			return bounds ? bounds.y + bounds.height : Number.POSITIVE_INFINITY;
		})
		.toBeLessThanOrEqual(871);
	await page.screenshot({ path: testInfo.outputPath("desktop-confirmation.png") });
	await expect(page.getByTestId("sent-orders")).toHaveText("[]");
});

test("retains full-account targets when the visible list is filtered and details are toggled", async ({ page }) => {
	await page.goto("/position-close-all.html");
	const toggle = page.getByTestId("toggle-position-details");
	await toggle.click();
	await expect(toggle).toHaveText("Collapse all");
	await toggle.click();
	await expect(toggle).toHaveText("Expand all");
	await page.getByRole("button", { name: "Filter positions by direction: All", exact: true }).click();
	await page.getByRole("menuitem", { name: "Short", exact: true }).click();
	await expect(page.getByTestId("positions-surface")).not.toContainText("HYPE");
	await openConfirmation(page);
	await expect(page.getByRole("dialog")).toContainText("including positions hidden by filters");
	await expect(page.getByRole("list", { name: "Positions to close" })).toContainText("HYPE");
	await expect(page.getByRole("list", { name: "Positions to close" })).toContainText("Short");
	await expect(page.getByTestId("sent-orders")).toHaveText("[]");
});

for (const state of ["Connection", "loading", "stale", "error", "Markets", "Mismatch owner"]) {
	test(`disables the entry for ${state} without trading`, async ({ page }) => {
		await page.goto("/position-close-all.html");
		await page.getByRole("button", { name: state, exact: true }).click();
		await expect(page.getByTestId("mobile-close-all-positions")).toBeDisabled();
		await expect(page.getByTestId("sent-orders")).toHaveText("[]");
		await expect(page.getByRole("dialog")).toHaveCount(0);
	});
}

test("keeps the real controller and submit hook alive through tab and desktop transitions", async ({ page }) => {
	await page.goto("/position-close-all.html");
	await page.getByRole("button", { name: "Hold exchange", exact: true }).click();
	await openConfirmation(page);
	const displayed = await page
		.getByRole("list", { name: "Positions to close" })
		.getByRole("listitem")
		.allTextContents();
	const sizes = displayed.map((text) => Big(text.split("·")[1].trim()).toString());
	const session = await page.getByTestId("session-id").textContent();
	await confirm(page);
	const feedback = page.locator("[data-order-feedback]");
	await expect(feedback).toHaveCount(1);
	await expect(feedback).toContainText("Submitting");
	const feedbackId = await feedback.getAttribute("data-order-feedback");
	await expect(page.getByTestId("sent-orders")).toContainText('"r":true');
	await expect(page.getByTestId("mobile-close-all-positions")).toBeDisabled();
	await page.getByRole("button", { name: "Switch tab", exact: true }).click();
	await page.setViewportSize({ width: 1001, height: 871 });
	await page.getByRole("button", { name: "Switch tab", exact: true }).click();
	await expect(page.getByTestId("session-id")).toHaveText(session!);
	await expect(
		page.getByTestId("positions-surface").getByRole("button", { name: "Close All Positions", exact: true }),
	).toBeDisabled();
	await page.getByRole("button", { name: "Release", exact: true }).click();
	await expect(feedback).toContainText("All positions closed");
	await expect(feedback).toHaveAttribute("data-order-feedback", feedbackId!);
	await expect(feedback.getByText("Fully filled", { exact: true })).toHaveCount(2);
	await expect(page.locator("[data-sonner-toast]")).toHaveCount(1);
	await expect(page.getByTestId("session-id")).toHaveText("none");
	const batches = JSON.parse((await page.getByTestId("sent-orders").textContent())!);
	expect(batches).toHaveLength(1);
	expect(batches[0].orders.map((order: { s: string }) => order.s)).toEqual(sizes);
	expect(batches[0]).toMatchObject({
		grouping: "na",
		orders: [
			{ a: 0, b: false, s: "1.25", r: true, t: { limit: { tif: "FrontendMarket" } } },
			{ a: 100000, b: true, s: "2.5", r: true, t: { limit: { tif: "FrontendMarket" } } },
		],
	});
});

for (const change of [
	"Change size",
	"Shrink size",
	"Reverse size",
	"Remove position",
	"Mismatch owner",
	"Network",
	"stale",
]) {
	test(`fails closed if ${change} occurs while preflight is pending`, async ({ page }) => {
		await page.goto("/position-close-all.html");
		await page.getByRole("button", { name: "Hold preflight", exact: true }).click();
		await openConfirmation(page);
		await confirm(page);
		const feedback = page.locator("[data-order-feedback]");
		await expect(feedback).toContainText("Submitting");
		await page.getByRole("button", { name: change, exact: true }).click();
		await page.getByRole("button", { name: "Release", exact: true }).click();
		await expect(page.getByTestId("session-id")).toHaveText("none");
		if (change === "Mismatch owner" || change === "Network") {
			await expect(feedback).toHaveCount(0);
			await page
				.getByRole("button", { name: change === "Mismatch owner" ? "Restore owner" : "Network", exact: true })
				.click();
		}
		await expect(feedback.getByRole("alert")).toContainText("Failed");
		await expect(page.getByTestId("sent-orders")).toHaveText("[]");
	});
}

test("keeps the all-account entry when margin filters produce an empty list", async ({ page }) => {
	await page.goto("/position-close-all.html");
	await page.getByRole("button", { name: "Filter positions by margin mode: All", exact: true }).click();
	await page.getByRole("menuitem", { name: "Isolated", exact: true }).click();
	await expect(page.getByText("No positions match the selected filters.", { exact: true })).toBeVisible();
	await expect(page.getByTestId("toggle-position-details")).toBeDisabled();
	await openConfirmation(page);
	await expect(page.getByRole("list", { name: "Positions to close" }).getByRole("listitem")).toHaveCount(2);
	await expect(page.getByTestId("sent-orders")).toHaveText("[]");
});

test("keeps confirmed empty accounts quiet with no close action", async ({ page }) => {
	await page.goto("/position-close-all.html");
	await page.getByRole("button", { name: "Empty account", exact: true }).click();
	await expect(page.getByText("No active positions.", { exact: true })).toBeVisible();
	await expect(page.getByTestId("mobile-close-all-positions")).toHaveCount(0);
	await expect(page.getByTestId("sent-orders")).toHaveText("[]");
});

test("hot-switches confirmation labels without replacing the session or disclosure state", async ({ page }) => {
	await page.goto("/position-close-all.html");
	await page.getByRole("button", { name: "Filter positions by direction: All", exact: true }).click();
	await page.getByRole("menuitem", { name: "Short", exact: true }).click();
	await page.getByTestId("toggle-position-details").click();
	await openConfirmation(page);
	const session = await page.getByTestId("session-id").textContent();
	const dialog = await page.getByRole("dialog").elementHandle();
	// The fixture locale control sits outside the modal focus trap.
	await page
		.getByRole("button", { name: "zh", exact: true, includeHidden: true })
		.evaluate((button: HTMLButtonElement) => button.click());
	await expect(page.getByRole("dialog")).toContainText("包括被筛选条件隐藏的仓位");
	await expect(page.getByRole("list", { name: "待平仓仓位" })).toContainText("HYPE");
	await expect(page.getByTestId("session-id")).toHaveText(session!);
	expect(await dialog!.evaluate((element) => element.isConnected)).toBe(true);
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toBeHidden();
	await page.getByRole("button", { name: "en", exact: true }).click();
	await expect(page.getByTestId("toggle-position-details")).toHaveText("Collapse all");
	await expect(page.getByRole("button", { name: "Filter positions by direction: Short", exact: true })).toBeVisible();
	await expect(page.getByTestId("positions-surface")).not.toContainText("HYPE");
	await expect(page.getByTestId("sent-orders")).toHaveText("[]");
});

test("rejects an expired snapshot and an active TWAP", async ({ page }) => {
	await page.goto("/position-close-all.html");
	await page.clock.install();
	await openConfirmation(page);
	await page.clock.fastForward(31000);
	await confirm(page);
	await expect(page.locator("[data-order-feedback]").getByRole("alert")).toContainText("Failed");
	await expect(page.getByTestId("sent-orders")).toHaveText("[]");
	await page.getByRole("button", { name: "Active TWAP", exact: true }).click();
	await openConfirmation(page);
	await confirm(page);
	await expect(page.getByTestId("sent-orders")).toHaveText("[]");
});

for (const outcome of ["Partial", "Ambiguous"]) {
	test(`reports ${outcome} without success or automatic resend`, async ({ page }) => {
		await page.goto("/position-close-all.html");
		await page.getByRole("button", { name: outcome, exact: true }).click();
		await openConfirmation(page);
		await confirm(page);
		const feedback = page.locator("[data-order-feedback]");
		await expect(feedback).toHaveCount(1);
		await expect(feedback).not.toContainText("All positions closed");
		if (outcome === "Partial") {
			await expect(feedback).toContainText("Partially completed");
			await expect(feedback).toContainText("Fully filled 1/2 · Review positions");
			await expect(feedback.getByText("Fully filled", { exact: true })).toHaveCount(1);
			await expect(feedback.getByText("Rejected", { exact: true })).toHaveCount(1);
			await expect(feedback).toContainText("Filled: 1.25 / 1.25");
			await expect(feedback).toContainText("Order could not immediately match against any resting orders.");
		} else {
			await expect(feedback).toContainText("Confirming — do not resubmit");
			await expect(feedback.getByText("Status unconfirmed", { exact: true })).toHaveCount(2);
		}
		await expect(page.locator("[data-sonner-toast]")).toHaveCount(1);
		await expect(page.getByTestId("session-id")).toHaveText("none");
		expect(JSON.parse((await page.getByTestId("sent-orders").textContent())!)).toHaveLength(1);
	});
}

test("hot-switches the mounted waiting feedback without changing its task or sending twice", async ({ page }) => {
	await page.goto("/position-close-all.html");
	await page.getByRole("button", { name: "Hold exchange", exact: true }).click();
	await openConfirmation(page);
	await confirm(page);
	const feedback = page.locator("[data-order-feedback]");
	await expect(feedback).toContainText("Submitting");
	const id = await feedback.getAttribute("data-order-feedback");
	const element = await feedback.elementHandle();
	await page.getByRole("button", { name: "zh", exact: true }).click();
	await expect(feedback).toHaveAttribute("aria-label", "一键全平");
	await expect(feedback).toHaveAttribute("data-order-feedback", id!);
	expect(await element!.evaluate((node) => node.isConnected)).toBe(true);
	await page.getByRole("button", { name: "en", exact: true }).click();
	await page.getByRole("button", { name: "Release", exact: true }).click();
	await expect(feedback).toContainText("All positions closed");
	expect(JSON.parse((await page.getByTestId("sent-orders").textContent())!)).toHaveLength(1);
});

test("hiding waiting feedback keeps the request active and shows its eventual result", async ({ page }) => {
	await page.goto("/position-close-all.html");
	await page.getByRole("button", { name: "Hold exchange", exact: true }).click();
	await openConfirmation(page);
	await confirm(page);
	const feedback = page.locator("[data-order-feedback]");
	await expect(feedback).toContainText("Submitting");
	const id = await feedback.getAttribute("data-order-feedback");
	await feedback.getByRole("button", { name: "Dismiss", exact: true }).click();
	await expect(feedback).toHaveCount(0);
	await expect(page.getByTestId("mobile-close-all-positions")).toBeDisabled();
	expect(JSON.parse((await page.getByTestId("sent-orders").textContent())!)).toHaveLength(1);
	await page.getByRole("button", { name: "Release", exact: true }).click();
	await expect(feedback).toContainText("All positions closed");
	await expect(feedback).toHaveAttribute("data-order-feedback", id!);
	await expect(page.getByTestId("session-id")).toHaveText("none");
	expect(JSON.parse((await page.getByTestId("sent-orders").textContent())!)).toHaveLength(1);
});
