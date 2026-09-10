import { expect, type Page, test } from "@playwright/test";

const tooltipSelector = '[data-slot="orderbook-cumulative-tooltip"]';
const fixtures = [
	{ view: "desktop", width: 280, height: 677, viewport: { width: 1200, height: 844 } },
	{ view: "compact", width: 164, height: 425, viewport: { width: 390, height: 844 } },
	{ view: "split", width: 390, height: 425, viewport: { width: 390, height: 844 } },
] as const;

function row(page: Page, side: "ask" | "bid", rank: number) {
	return page.locator(`button[data-orderbook-side="${side}"][data-orderbook-rank="${rank}"]`);
}

async function openFixture(page: Page, fixture: (typeof fixtures)[number]) {
	await page.setViewportSize(fixture.viewport);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/orderbook-layout.html");
	await page.waitForFunction(() => typeof window.setOrderbookLayoutFixture === "function");
	await page.evaluate((options) => window.setOrderbookLayoutFixture(options), fixture);
	if (fixture.view === "desktop") {
		await page.locator('[data-slot="orderbook-layout-fixture"]').evaluate((element) => {
			(element as HTMLElement).style.marginLeft = "300px";
		});
	}
	await page.evaluate(() => {
		window.setOrderbookHoverReference("100");
		return window.publishOrderbookHoverSnapshot({ sizes: ["1", "2", "3"] });
	});
	await expect(row(page, "ask", 2)).toBeEnabled();
}

async function expectSummary(page: Page, values: string[]) {
	const tooltip = page.locator(tooltipSelector);
	await expect(tooltip).toBeVisible();
	await expect(tooltip.locator("dt")).toHaveText([
		"Distance from mid",
		"Average Price",
		"Total (CLS_HYPE)",
		"Total (USDC)",
	]);
	await expect(tooltip.locator("dd")).toHaveText(values);
}

async function expectTooltipInViewport(page: Page) {
	await expect
		.poll(() =>
			page.locator(tooltipSelector).evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				return (
					bounds.width > 0 &&
					bounds.left >= 9 &&
					bounds.right <= window.innerWidth - 9 &&
					bounds.top >= 9 &&
					bounds.bottom <= window.innerHeight - 9
				);
			}),
		)
		.toBe(true);
}

for (const fixture of fixtures) {
	test(`${fixture.view} displays cumulative arithmetic and keeps pointer rank through live updates`, async ({
		page,
	}) => {
		await openFixture(page, fixture);
		const requests: string[] = [];
		const sockets: string[] = [];
		page.on("request", (request) => requests.push(request.url()));
		page.on("websocket", (socket) => sockets.push(socket.url()));
		const retained = row(page, "ask", 2);
		await retained.evaluate((element) => element.setAttribute("data-fixture-retained", "true"));
		await retained.hover();
		await expectSummary(page, ["3.0000%", "102.33", "6.00", "614"]);
		await expect(row(page, "ask", 0)).toHaveAttribute("data-orderbook-hover", "range");
		await expect(row(page, "ask", 1)).toHaveAttribute("data-orderbook-hover", "range");
		await expect(retained).toHaveAttribute("data-orderbook-hover", "active");
		await expect(row(page, "ask", 3)).not.toHaveAttribute("data-orderbook-hover");
		await expect(page.locator('button[data-orderbook-side="bid"][data-orderbook-hover]')).toHaveCount(0);
		await expect(retained).toHaveAttribute(
			"aria-describedby",
			(await page.locator(tooltipSelector).getAttribute("id")) ?? "",
		);
		const dashed = await retained.evaluate((element) => getComputedStyle(element, "::after").backgroundImage);
		expect(dashed).toContain("repeating-linear-gradient");
		await expect(retained).toHaveAttribute("data-orderbook-hover-edge", fixture.view === "split" ? "bottom" : "top");

		await page.evaluate(() => window.publishOrderbookHoverSnapshot({ ask: "100.5", size: "2" }));
		await expectSummary(page, ["2.0000%", "101.17", "6.00", "607"]);
		await expect(row(page, "ask", 2)).toHaveAttribute("data-orderbook-price", "102");
		await expect(row(page, "ask", 2)).toHaveAttribute("data-orderbook-hover", "active");
		await expect(page.locator('[data-fixture-retained="true"]')).toHaveAttribute("data-orderbook-price", "103");
		await expect(page.locator('[data-fixture-retained="true"]')).toHaveAttribute("data-orderbook-rank", "3");
		await page.evaluate(() => window.setOrderbookHoverReference("102"));
		await expectSummary(page, ["0.0000%", "101.17", "6.00", "607"]);
		await page.evaluate(() => window.setOrderbookHoverReference("102", false));
		await expectSummary(page, ["—", "101.17", "6.00", "607"]);

		await row(page, "ask", 2).click();
		await expect.poll(() => page.evaluate(() => window.getOrderbookLayoutSelectedPrice())).toBe("102");
		expect(requests).toEqual([]);
		expect(sockets).toEqual([]);
	});

	test(`${fixture.view} retains internal gaps and dismisses stale and keyboard sessions`, async ({ page }) => {
		await openFixture(page, fixture);
		await row(page, "ask", 2).hover();
		const boxes = await Promise.all([row(page, "ask", 1).boundingBox(), row(page, "ask", 2).boundingBox()]);
		const [top, bottom] = boxes.filter((box) => box !== null).sort((a, b) => a.y - b.y);
		if (!top || !bottom) throw new Error("Missing adjacent rows");
		await page.mouse.move(top.x + top.width / 2, (top.y + top.height + bottom.y) / 2);
		await expectSummary(page, ["3.0000%", "102.33", "6.00", "614"]);
		if (fixture.view !== "split") {
			await page
				.locator(`[data-slot="${fixture.view === "desktop" ? "orderbook-spread" : "compact-orderbook-mid"}"]`)
				.hover();
		} else await page.mouse.move(fixture.width + 20, 20);
		await expect(page.locator(tooltipSelector)).toHaveCount(0);

		await row(page, "bid", 2).hover();
		await expectSummary(page, ["3.0000%", "97.667", "6.00", "586"]);
		await page.evaluate(() => window.setOrderbookHoverUnavailable("stale"));
		await expect(page.locator(tooltipSelector)).toHaveCount(0);
		await page.evaluate(() => window.publishOrderbookHoverSnapshot({ sizes: ["1", "2", "3"] }));
		await expect(row(page, "bid", 2)).toBeEnabled();
		await expect(page.locator(tooltipSelector)).toHaveCount(0);
		await page.mouse.move(fixture.width + 20, 20);
		await page.keyboard.press("Tab");
		const focused = row(page, "bid", 2);
		await focused.focus();
		await expectSummary(page, ["3.0000%", "97.667", "6.00", "586"]);
		await focused.press("Escape");
		await expect(focused).toBeFocused();
		await expect(page.locator(tooltipSelector)).toHaveCount(0);
		await expect(page.locator("[data-orderbook-hover]")).toHaveCount(0);
		await focused.press("Enter");
		await expect.poll(() => page.evaluate(() => window.getOrderbookLayoutSelectedPrice())).toBe("97");
	});

	test(`${fixture.view} constrains dark and light tooltips after resizing`, async ({ page }, testInfo) => {
		await openFixture(page, fixture);
		for (const theme of ["dark", "light"] as const) {
			await page.evaluate((theme) => window.setOrderbookHoverTheme(theme), theme);
			await page.evaluate(() => window.setOrderbookHoverReference("100"));
			await row(page, "ask", 2).hover();
			await expectSummary(page, ["3.0000%", "102.33", "6.00", "614"]);
			await expectTooltipInViewport(page);
			if (fixture.view === "desktop") {
				const rowBox = await row(page, "ask", 2).boundingBox();
				const tooltipBox = await page.locator(tooltipSelector).boundingBox();
				if (!rowBox || !tooltipBox) throw new Error("Missing positioned tooltip");
				expect(tooltipBox.x + tooltipBox.width).toBeLessThan(rowBox.x);
			}
			const screenshot = testInfo.outputPath(`${fixture.view}-${theme}-cumulative-hover.png`);
			await page.screenshot({ path: screenshot });
			await testInfo.attach(`${fixture.view}-${theme}-hover`, { path: screenshot, contentType: "image/png" });
			await page.evaluate(({ width, height }) => window.resizeOrderbookHoverFixture(width - 20, height - 30), fixture);
			await expect(page.locator(tooltipSelector)).toHaveCount(0);
			await row(page, "bid", 2).hover();
			await expectSummary(page, ["3.0000%", "97.667", "6.00", "586"]);
			await expectTooltipInViewport(page);
			await page.evaluate(({ width, height }) => window.resizeOrderbookHoverFixture(width, height), fixture);
		}
	});
}

test("horizontal window resizing dismisses pointer hover without changing ladder geometry", async ({ page }) => {
	await openFixture(page, fixtures[0]);
	const target = row(page, "ask", 2);
	await target.hover();
	await expectSummary(page, ["3.0000%", "102.33", "6.00", "614"]);
	const before = await target.boundingBox();
	await page.setViewportSize({ width: 1100, height: fixtures[0].viewport.height });
	await expect(page.locator(tooltipSelector)).toHaveCount(0);
	expect(await target.boundingBox()).toEqual(before);
	await expect(page.locator("[data-orderbook-hover]")).toHaveCount(0);
	await expect.poll(() => page.evaluate(() => window.getOrderbookLayoutSelectedPrice())).toBeNull();
});

test("native document and internal ancestor scrolling dismiss pointer hover", async ({ page }) => {
	for (const scrollTarget of ["document", "ancestor"] as const) {
		await openFixture(page, fixtures[0]);
		await page.evaluate((scrollTarget) => {
			if (scrollTarget === "document") {
				const spacer = document.createElement("div");
				spacer.style.height = "1000px";
				document.body.append(spacer);
				return;
			}
			const root = document.getElementById("root");
			if (!root) throw new Error("Missing fixture root");
			const scrollContainer = document.createElement("div");
			scrollContainer.dataset.fixtureScrollContainer = "true";
			scrollContainer.style.height = "480px";
			scrollContainer.style.overflow = "auto";
			root.before(scrollContainer);
			scrollContainer.append(root);
		}, scrollTarget);
		await row(page, "ask", 2).hover();
		await expectSummary(page, ["3.0000%", "102.33", "6.00", "614"]);
		await page.evaluate((scrollTarget) => {
			if (scrollTarget === "document") window.scrollTo(0, 24);
			else document.querySelector('[data-fixture-scroll-container="true"]')?.scrollTo(0, 24);
		}, scrollTarget);
		await expect
			.poll(() =>
				page.evaluate(
					(scrollTarget) =>
						scrollTarget === "document"
							? window.scrollY
							: document.querySelector('[data-fixture-scroll-container="true"]')?.scrollTop,
					scrollTarget,
				),
			)
			.toBe(24);
		await expect(page.locator(tooltipSelector)).toHaveCount(0);
		await expect(page.locator("[data-orderbook-hover]")).toHaveCount(0);
		await expect.poll(() => page.evaluate(() => window.getOrderbookLayoutSelectedPrice())).toBeNull();
	}
});

test.describe("compact touch cumulative hover", () => {
	test.use({ hasTouch: true });
	test("long press inspects without filling, movement cancels, and a tap still selects", async ({ page }) => {
		await openFixture(page, fixtures[1]);
		const target = row(page, "bid", 2);
		const box = await target.boundingBox();
		if (!box) throw new Error("Missing touch row");
		const x = box.x + box.width / 2;
		const y = box.y + box.height / 2;
		const cdp = await page.context().newCDPSession(page);
		try {
			await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
			await expectSummary(page, ["3.0000%", "97.667", "6.00", "586"]);
			await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			await expect.poll(() => page.evaluate(() => window.getOrderbookLayoutSelectedPrice())).toBeNull();
			await page.evaluate(() => window.setOrderbookHoverUnavailable("stale"));
			await page.evaluate(() => window.publishOrderbookHoverSnapshot({ sizes: ["1", "2", "3"] }));
			await expect(page.locator(tooltipSelector)).toHaveCount(0);
			await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
			await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - 30 }] });
			await page.waitForTimeout(500);
			await expect(page.locator(tooltipSelector)).toHaveCount(0);
			await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			await expect.poll(() => page.evaluate(() => window.getOrderbookLayoutSelectedPrice())).toBeNull();
			await row(page, "bid", 2).tap();
			await expect.poll(() => page.evaluate(() => window.getOrderbookLayoutSelectedPrice())).toBe("97");
		} finally {
			await cdp.detach();
		}
	});
});
