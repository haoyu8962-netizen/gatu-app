import { expect, type Locator, type Page, test } from "@playwright/test";

async function readGridGeometry(page: Page) {
	return page.locator("[data-panel]").evaluateAll((panels) =>
		panels.map((panel) => {
			const { x, y, width, height } = panel.getBoundingClientRect();
			return { name: panel.getAttribute("data-panel"), x: x + scrollX, y: y + scrollY, width, height };
		}),
	);
}

async function expectTopActions(page: Page, locale: "en" | "zh") {
	const panel = page.locator('[data-panel="accountInfo"]');
	const deposit = panel.getByRole("button", { name: locale === "en" ? "Deposit" : "存款", exact: true });
	const withdraw = panel.getByRole("button", { name: locale === "en" ? "Withdraw" : "提款", exact: true });
	const transfer = panel.getByRole("button", { name: locale === "en" ? "Perps / Spot" : "合约 / 现货", exact: true });
	await expect(deposit).toBeVisible();
	await expect(withdraw).toBeVisible();
	await expect(transfer).toBeVisible();
	await expect(deposit.locator("svg")).toHaveCount(0);
	await expect(withdraw.locator("svg")).toHaveCount(0);
	await expect
		.poll(() =>
			panel.evaluate((element) => {
				const panel = element.getBoundingClientRect();
				const actions = element.querySelector('[data-slot="account-panel-actions"]');
				const buttons = actions?.querySelectorAll("button");
				const section = element.querySelector("section");
				const metrics = section?.closest("[data-grid-content-part]");
				const table = document.querySelector('[data-panel="accountTable"]');
				const book = document.querySelector('[data-panel="marketData"]');
				const heading = element.querySelector("h2");
				if (!buttons || buttons.length < 3 || !section || !metrics || !table || !book || !heading)
					return ["missing regions"];
				const [deposit, withdraw, transfer] = [...buttons].map((button) => button.getBoundingClientRect());
				const metricRect = metrics.getBoundingClientRect();
				const headingRect = heading.getBoundingClientRect();
				const tableRect = table.getBoundingClientRect();
				const bookRect = book.getBoundingClientRect();
				const stacked = window.innerWidth <= 1420;
				const errors: string[] = [];
				if (Math.abs(deposit.y - withdraw.y) > 1) errors.push("primary actions not in one row");
				if (Math.abs(deposit.width - withdraw.width) > 1) errors.push("primary action widths differ");
				if (Math.abs(withdraw.x - deposit.right - 8) > 1) errors.push("primary action gap differs");
				if (deposit.y - panel.y < 8 || deposit.y - panel.y > 16) errors.push("actions are not at panel top");
				if (Math.abs(transfer.y - deposit.bottom - 8) > 1) errors.push("transfer gap differs");
				if (Math.abs(transfer.width - withdraw.right + deposit.x) > 1) errors.push("transfer is not full width");
				if (Math.abs(metricRect.top - transfer.bottom - 12) > 1) errors.push("divider top gap differs");
				if (Math.abs(section.getBoundingClientRect().top - metricRect.top - 13) > 1)
					errors.push("divider bottom gap differs");
				if (headingRect.width > 1 || headingRect.height > 1) errors.push("Account heading consumes visible height");
				if (stacked && (Math.abs(panel.y - bookRect.bottom - 3) > 1 || Math.abs(tableRect.y - bookRect.y) > 1))
					errors.push("account boundaries differ");
				if (!stacked && (Math.abs(tableRect.y - panel.y) > 1 || Math.abs(tableRect.bottom - panel.bottom) > 1))
					errors.push("account boundaries differ");
				if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)
					errors.push("panel overflows");
				for (const button of buttons) {
					const rect = button.getBoundingClientRect();
					const style = getComputedStyle(button);
					if (button.scrollWidth > button.clientWidth + 1 || rect.left < panel.left || rect.right > panel.right)
						errors.push("action text clips");
					if (rect.height < 32 || rect.height > 36) errors.push("action height differs");
					if (
						Math.abs(
							Number.parseFloat(style.borderRadius) - 8 * Number.parseFloat(style.getPropertyValue("--radius-factor")),
						) > 0.1
					)
						errors.push("action radius diverges from shared token");
				}
				return errors;
			}),
		)
		.toEqual([]);
}

test.beforeEach(async ({ page }) => {
	page.on("pageerror", (error) => {
		throw error;
	});
});

for (const width of [1001, 1363, 2016]) {
	for (const theme of ["light", "dark"] as const) {
		test(`keeps ${theme} account actions above metrics in the real grid at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 1330 });
			await page.goto("/account-actions.html");
			await page.getByRole("button", { name: `Theme ${theme}`, exact: true }).click();
			await expect(page.locator("html")).toHaveClass(new RegExp(`(^| )${theme}( |$)`));
			await expectTopActions(page, "en");
			const initial = await readGridGeometry(page);
			await page.getByRole("button", { name: "中文", exact: true }).click();
			await expectTopActions(page, "zh");
			expect(await readGridGeometry(page)).toEqual(initial);
			await page.getByRole("button", { name: "English", exact: true }).click();
			await expectTopActions(page, "en");
			await page.screenshot({ path: test.info().outputPath(`account-actions-${width}-${theme}.png`), fullPage: true });
		});
	}
}

test("routes enabled controls and preserves shared-mode, snapshot, and region guards", async ({ page }) => {
	await page.setViewportSize({ width: 1363, height: 1330 });
	await page.goto("/account-actions.html");
	const panel = page.locator('[data-panel="accountInfo"]');
	const captured = page.getByRole("status", { name: "Opened funds actions" });
	await panel.getByRole("button", { name: "Deposit", exact: true }).click();
	await panel.getByRole("button", { name: "Withdraw", exact: true }).click();
	await panel.getByRole("button", { name: "Perps / Spot", exact: true }).click();
	await expect(captured).toHaveText('["deposit","withdraw","toPerp"]');
	const initial = await readGridGeometry(page);
	await page.getByRole("button", { name: "Unified", exact: true }).click();
	const transfer = panel.getByRole("button", { name: "Perps / Spot", exact: true });
	await expect(transfer).toHaveCount(0);
	await expect(captured).toHaveText('["deposit","withdraw","toPerp"]');
	await page.getByRole("button", { name: "Snapshot", exact: true }).click();
	const withdraw = panel.getByRole("button", { name: "Withdraw", exact: true });
	await expect(withdraw).toBeDisabled();
	await withdraw.evaluate((button) => (button as HTMLButtonElement).click());
	await expect(captured).toHaveText('["deposit","withdraw","toPerp"]');
	await page.getByRole("button", { name: "Snapshot", exact: true }).click();
	await expect(withdraw).toBeEnabled();
	expect(await readGridGeometry(page)).toEqual(initial);
	await page.getByRole("button", { name: "Restricted", exact: true }).click();
	await expect(panel.getByRole("button")).toHaveCount(0);
	await expect(captured).toHaveText('["deposit","withdraw","toPerp"]');
});

test("keeps disconnected funding inert while allowing only the sponsored email deposit exception", async ({ page }) => {
	await page.setViewportSize({ width: 1001, height: 1330 });
	await page.goto("/account-actions.html");
	const panel = page.locator('[data-panel="accountInfo"]');
	const captured = page.getByRole("status", { name: "Opened funds actions" });
	await page.getByRole("button", { name: "Disconnected", exact: true }).click();
	const deposit = panel.getByRole("button", { name: "Deposit", exact: true });
	const withdraw = panel.getByRole("button", { name: "Withdraw", exact: true });
	await expect(deposit).toBeDisabled();
	await expect(withdraw).toBeDisabled();
	await deposit.evaluate((button) => (button as HTMLButtonElement).click());
	await expect(captured).toHaveText("[]");
	await page.getByRole("button", { name: "Sponsored email", exact: true }).click();
	await expect(deposit).toBeEnabled();
	await expect(withdraw).toBeDisabled();
	await deposit.click();
	await expect(captured).toHaveText('["deposit"]');
	await page.getByRole("button", { name: "Agent only", exact: true }).click();
	await expect(panel.getByRole("button")).toHaveCount(0);
	await expect(captured).toHaveText('["deposit"]');
});

for (const width of [375, 393]) {
	test(`pairs mobile funding actions and hides shared-mode transfer at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: width === 375 ? 666 : 852 });
		await page.goto("/account-actions.html?surface=mobile");
		const actions = page.locator('[data-slot="mobile-account-actions"]');
		const deposit = actions.getByRole("button", { name: "Deposit", exact: true });
		const withdraw = actions.getByRole("button", { name: "Withdraw", exact: true });
		const transfer = actions.getByRole("button", { name: "Perps / Spot", exact: true });
		await expect(deposit).toBeVisible();
		const a = await deposit.boundingBox();
		const b = await withdraw.boundingBox();
		expect(a && b && Math.abs(a.y - b.y) < 1 && Math.abs(a.width - b.width) < 1 && a.height >= 44).toBe(true);
		await expect(transfer).toBeVisible();
		await page.getByRole("button", { name: "Unified", exact: true }).click();
		await expect(transfer).toHaveCount(0);
		await page.getByRole("button", { name: "中文", exact: true }).click();
		await expect(actions.getByRole("button", { name: "存款", exact: true })).toBeVisible();
		await expect(actions.getByRole("button", { name: "提款", exact: true })).toBeVisible();
		expect(await actions.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
		await page.screenshot({ path: test.info().outputPath(`mobile-account-${width}.png`), fullPage: true });
	});
}

async function waitForDialogTransition(page: Page) {
	const dialog = page.getByRole("dialog");
	let previous = "";
	await expect
		.poll(
			async () => {
				const state = await dialog.evaluate((node) => {
					const { x, y, width, height } = node.getBoundingClientRect();
					return JSON.stringify([node.getAnimations().length, x, y, width, height]);
				});
				const settled = state === previous && state.startsWith("[0,");
				previous = state;
				return settled;
			},
			{ intervals: [120] },
		)
		.toBe(true);
}

async function expectFundsDialogScroll(
	page: Page,
	closeName: string,
	overflow: "none" | "required" | "any",
	fixedControlNames: string[] = [],
) {
	const dialog = page.getByRole("dialog");
	await waitForDialogTransition(page);
	const body = dialog.locator('[data-slot="funds-modal-body"]');
	const fixedControls = [closeName, ...fixedControlNames].map((name) =>
		dialog.getByRole("button", { name, exact: true }),
	);
	for (const control of fixedControls) {
		expect(await control.evaluate((node) => node.closest('[data-slot="funds-modal-body"]'))).toBeNull();
		await expect(control).toBeVisible();
		await expect(control).toBeInViewport({ ratio: 1 });
	}
	expect(await readContentUnderFixedControls(body, fixedControls, [0])).toEqual([]);
	const metrics = await body.evaluate((element) => {
		const node = element as HTMLElement;
		const popup = node.closest('[role="dialog"]') as HTMLElement;
		return {
			scrollbar: getComputedStyle(node).scrollbarWidth,
			bodyOverflow: getComputedStyle(node).overflowY,
			gutter: node.offsetWidth - node.clientWidth,
			bodyOverflows: node.scrollHeight > node.clientHeight + 1,
			popupScrolls: popup.scrollHeight > popup.clientHeight + 1,
			popupOverflow: getComputedStyle(popup).overflowY,
		};
	});
	expect(metrics.scrollbar).toBe("none");
	expect(metrics.bodyOverflow).toBe("auto");
	expect(metrics.gutter).toBe(0);
	expect(metrics.popupScrolls).toBe(false);
	expect(metrics.popupOverflow).toBe("hidden");
	if (overflow === "none") expect(metrics.bodyOverflows).toBe(false);
	if (overflow === "required") expect(metrics.bodyOverflows).toBe(true);
	if (!metrics.bodyOverflows) return;

	const controlsBefore = await Promise.all(fixedControls.map((control) => control.boundingBox()));
	const bodyBox = await body.boundingBox();
	if (!bodyBox || controlsBefore.some((box) => box === null)) throw new Error("Funds dialog geometry is unavailable");
	await page.mouse.move(bodyBox.x + bodyBox.width / 2, bodyBox.y + bodyBox.height / 2);
	await page.mouse.wheel(0, 2_000);
	await expect.poll(() => body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
	await expect
		.poll(() => body.evaluate((node) => Math.abs(node.scrollTop + node.clientHeight - node.scrollHeight) <= 1))
		.toBe(true);
	expect(await Promise.all(fixedControls.map((control) => control.boundingBox()))).toEqual(controlsBefore);
	for (const control of fixedControls) await expect(control).toBeInViewport({ ratio: 1 });
	expect(await dialog.evaluate((node) => node.scrollTop)).toBe(0);
	await page.mouse.wheel(0, -2_000);
	await expect.poll(() => body.evaluate((node) => node.scrollTop)).toBe(0);

	const scrollRange = await body.evaluate((node) => node.scrollHeight - node.clientHeight);
	const offsets = Array.from({ length: Math.ceil(scrollRange / 8) + 1 }, (_, step) => Math.min(step * 8, scrollRange));
	expect(await readContentUnderFixedControls(body, fixedControls, offsets)).toEqual([]);
	await body.evaluate((node) => {
		node.scrollTop = 0;
	});
}

/**
 * The close and back buttons reach below the header. At every scroll offset each of them must be
 * the topmost element across its own box, and the only body content allowed under it is the form's
 * sticky heading band, painted fully opaque in the dialog's own surface colour. This samples nine
 * points per control at each offset through hit testing: it is not a pixel proof, and it does not
 * see content painted with `pointer-events: none`. Returns each offender as `offset: description`.
 */
async function readContentUnderFixedControls(body: Locator, controls: Locator[], offsets: number[]) {
	const handles = await Promise.all(controls.map((control) => control.elementHandle()));
	return body.evaluate(
		(node, { controlNodes, scrollOffsets }) => {
			const popup = node.closest('[role="dialog"]') as HTMLElement;
			const heading = node.querySelector('[data-slot="funds-modal-heading"]');
			const surface = getComputedStyle(popup).backgroundColor;
			const offenders: string[] = [];
			if (heading) {
				const band = getComputedStyle(heading).backgroundColor;
				if (band !== surface || !/^rgb\(/.test(surface)) offenders.push(`heading band is ${band} on ${surface}`);
				let opacity = 1;
				for (let element: Element | null = heading; element; element = element === popup ? null : element.parentElement) {
					opacity *= Number(getComputedStyle(element).opacity);
				}
				if (opacity !== 1) offenders.push(`heading band has opacity ${opacity}`);
			}
			for (const offset of scrollOffsets) {
				node.scrollTop = offset;
				const bodyBox = node.getBoundingClientRect();
				for (const control of controlNodes) {
					if (!control) continue;
					const box = control.getBoundingClientRect();
					const label = control.getAttribute("aria-label") ?? control.textContent?.trim();
					for (const fraction of [0.25, 0.5, 0.75]) {
						for (const y of [box.top + box.height * 0.25, box.top + box.height / 2, box.top + box.height * 0.75]) {
							const top = document.elementFromPoint(box.left + box.width * fraction, y);
							if (!top || !control.contains(top)) offenders.push(`${offset}: ${label} is covered by ${top?.tagName}`);
						}
					}
					for (const x of [box.left + 1, (box.left + box.right) / 2, box.right - 1]) {
						for (const y of [box.top + 1, (box.top + box.bottom) / 2, box.bottom - 1]) {
							if (y < bodyBox.top || y > bodyBox.bottom) continue;
							const content = document
								.elementsFromPoint(x, y)
								.find((element) => element !== node && node.contains(element));
							if (!content || heading?.contains(content) || (heading && content.contains(heading))) continue;
							offenders.push(`${offset}: ${content.tagName.toLowerCase()} ${content.textContent?.trim().slice(0, 40)}`);
						}
					}
				}
			}
			return [...new Set(offenders)];
		},
		{ controlNodes: handles, scrollOffsets: offsets },
	);
}

async function readFundingAddressGeometry(page: Page) {
	return page
		.getByRole("dialog")
		.locator("[data-address-state]")
		.evaluate((card) => {
			const field = card.querySelector('[class*="min-h-11"]') as HTMLElement;
			const frame = card.querySelector('[class*="size-[140px]"]') as HTMLElement;
			return {
				card: (card as HTMLElement).offsetHeight,
				field: field.offsetHeight,
				frame: frame.offsetHeight,
			};
		});
}

for (const width of [375, 393, 1363]) {
	for (const theme of ["light", "dark"] as const) {
		test(`keeps ${theme} funding forms readable and drafts stable at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: width === 375 ? 666 : 852 });
			await page.goto("/account-actions.html?surface=funds");
			await page.getByRole("button", { name: `Theme ${theme}`, exact: true }).click();
			await page.getByRole("button", { name: "Open withdraw", exact: true }).click();
			const dialog = page.getByRole("dialog");
			await expect(dialog.getByRole("heading", { name: "Withdraw USDC to Arbitrum" })).toBeVisible();
			await expect(dialog.getByRole("combobox")).toHaveCount(0);
			await expect(dialog.getByText("Minimum", { exact: false })).toContainText("0.40 USDC");
			await dialog.getByLabel("Amount", { exact: true }).fill("2.50");
			const address = "0x2222222222222222222222222222222222222222";
			await dialog.getByLabel("Destination address", { exact: true }).fill(address);
			await expect(dialog.getByText("$2.30", { exact: true })).toBeVisible();
			expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
			await expectFundsDialogScroll(page, "Close", width === 375 ? "any" : "none");
			await dialog.getByRole("button", { name: "Withdraw to Arbitrum", exact: true }).scrollIntoViewIfNeeded();
			await expect(dialog.getByRole("button", { name: "Withdraw to Arbitrum", exact: true })).toBeInViewport();
			await page.screenshot({ path: test.info().outputPath(`withdraw-${width}-${theme}.png`) });
			await dialog.getByRole("button", { name: "Close", exact: true }).click();
			await page.getByRole("button", { name: "中文", exact: true }).click();
			await page.getByRole("button", { name: "Open withdraw", exact: true }).click();
			await expect(dialog.getByLabel("数量", { exact: true })).toHaveValue("2.50");
			await expect(dialog.getByLabel("目标地址", { exact: true })).toHaveValue(address);
			await dialog.getByRole("button", { name: "关闭", exact: true }).click();
			await page.getByRole("button", { name: "Open deposit", exact: true }).click();
			await expect(dialog.locator('[data-slot="funding-steps"] li')).toHaveCount(2);
			await expect(dialog.locator("canvas")).toBeVisible();
			await expect
				.poll(() =>
					dialog
						.locator('img[src^="/coins/"]')
						.evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0)),
				)
				.toBe(true);
			await expect(dialog.getByRole("combobox")).toHaveCount(0);
			expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
			await expect(dialog.locator('[data-slot="qr-token-logo"]')).toBeVisible();
			const route = dialog.locator('[data-slot="funds-route-details"]');
			await expect(route.locator("img")).toHaveCount(2);
			expect(
				await route.evaluate((node) => {
					const [asset, network] = [...node.children].map((child) => child.getBoundingClientRect());
					return Math.abs(asset.y - network.y) <= 1 && Math.abs(asset.height - network.height) <= 1;
				}),
			).toBe(true);
			await expectFundsDialogScroll(page, "关闭", width === 375 ? "required" : "none");
			const readyAddress = await readFundingAddressGeometry(page);
			await dialog.getByRole("button", { name: "关闭", exact: true }).click();
			await page.getByRole("button", { name: "Toggle address", exact: true }).click();
			await page.getByRole("button", { name: "Open deposit", exact: true }).click();
			await expect(dialog.locator('[data-address-state="loading"]')).toBeVisible();
			expect(await readFundingAddressGeometry(page)).toEqual(readyAddress);
			await dialog.getByRole("button", { name: "关闭", exact: true }).click();
			await page.getByRole("button", { name: "Toggle address", exact: true }).click();
			await page.getByRole("button", { name: "Open deposit", exact: true }).click();
			await expect(dialog.locator('[data-address-state="ready"]')).toBeVisible();
			await dialog.getByRole("button", { name: "完成", exact: true }).scrollIntoViewIfNeeded();
			await expect(dialog.getByRole("button", { name: "完成", exact: true })).toBeInViewport();
			await page.screenshot({ path: test.info().outputPath(`deposit-${width}-${theme}.png`) });
			await dialog.getByRole("button", { name: "完成", exact: true }).click();
			await page.getByRole("button", { name: "English", exact: true }).click();
			await page.getByRole("button", { name: "Toggle email", exact: true }).click();
			await page.getByRole("button", { name: "Toggle data", exact: true }).click();
			await page.getByRole("button", { name: "Open deposit", exact: true }).click();
			await expect(dialog.getByRole("alert")).toHaveCount(0);
			await expect(dialog.getByRole("button", { name: "Deposit", exact: true })).toBeDisabled();
			await expect(dialog.getByLabel("Amount", { exact: true })).toHaveValue("2.50");
			await dialog.getByRole("button", { name: "Retry", exact: true }).click();
			await expect(dialog.getByLabel("Amount", { exact: true })).toHaveValue("2.50");
			await expect(dialog.getByRole("button", { name: "Deposit", exact: true })).toBeEnabled();
		});
	}
}

for (const viewport of [
	{ width: 375, height: 260 },
	{ width: 375, height: 666 },
	{ width: 1363, height: 260 },
	{ width: 1363, height: 852 },
]) {
	test(`keeps the deposit status and wrong-network screens on the funds scroll structure at ${viewport.width}x${viewport.height}`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.goto("/account-actions.html?surface=funds");
		const dialog = page.getByRole("dialog");
		const overflow = viewport.height < 300 ? "required" : "none";

		await page.getByRole("button", { name: "Open status", exact: true }).click();
		await expect(dialog.getByText("Waiting for chain confirmation", { exact: true })).toBeVisible();
		await expectFundsDialogScroll(page, "Close", overflow);
		await dialog.getByRole("button", { name: "Dismiss status", exact: true }).scrollIntoViewIfNeeded();
		await dialog.getByRole("button", { name: "Dismiss status", exact: true }).click();
		await expect(dialog).toHaveCount(0);

		await page.getByRole("button", { name: "Open wrong network", exact: true }).click();
		await expect(dialog.getByRole("button", { name: "Switch to Arbitrum", exact: true })).toBeVisible();
		await expect(dialog.getByRole("alert")).toContainText("Unable to switch wallet to Arbitrum");
		await expectFundsDialogScroll(page, "Close", overflow, ["Back"]);
		await dialog.getByRole("button", { name: "Close", exact: true }).click();
		await expect(dialog).toHaveCount(0);
	});

	test(`keeps content from scrolling under the close button of every funds form at ${viewport.width}x${viewport.height}`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.goto("/account-actions.html?surface=funds");
		const dialog = page.getByRole("dialog");
		const overflow = viewport.height < 300 ? "required" : "any";
		const forms = [
			{ open: "Open deposit", heading: "Deposit USDC from Arbitrum", layout: "funding-address", overflow },
			{ open: "Open withdraw", heading: "Withdraw USDC to Arbitrum", focus: "Amount", overflow },
			{ before: "Toggle email", open: "Open deposit", heading: "Deposit USDC from Arbitrum", focus: "Amount", overflow },
			{ before: "Toggle card funding", open: "Open deposit", heading: "Deposit", layout: "methods", overflow: "any" },
			{ open: "Open deposit", transfer: true, heading: "Deposit USDC from Arbitrum", overflow },
			{ before: "Toggle email", open: "Open deposit", transfer: true, heading: "Deposit USDC from Arbitrum", overflow },
		] as const;

		for (const form of forms) {
			if ("before" in form) await page.getByRole("button", { name: form.before, exact: true }).click();
			await page.getByRole("button", { name: form.open, exact: true }).click();
			const methods = dialog.locator('[data-deposit-layout="methods"]');
			const back = dialog.getByRole("button", { name: "Back", exact: true });
			if ("transfer" in form) {
				await waitForDialogTransition(page);
				await methods.locator('[data-deposit-method="transfer"]').click();
				await expect(methods).toHaveCount(0);
			}
			const heading = dialog.locator('[data-slot="funds-modal-heading"]');
			await expect(heading).toHaveCount(1);
			await expect(heading).toContainText(form.heading);
			if ("layout" in form) await expect(dialog.locator(`[data-deposit-layout="${form.layout}"]`)).toBeVisible();
			await expect(back).toHaveCount("transfer" in form ? 1 : 0);
			await expectFundsDialogScroll(page, "Close", form.overflow, "transfer" in form ? ["Back"] : []);

			if ("focus" in form && viewport.height < 300) {
				const body = dialog.locator('[data-slot="funds-modal-body"]');
				const input = dialog.getByLabel(form.focus, { exact: true });
				await input.evaluate((node) => (node as HTMLElement).blur());
				await body.evaluate((node) => {
					node.scrollTop = node.scrollHeight;
				});
				const bodyTop = await body.evaluate((node) => node.getBoundingClientRect().top);
				const hidden = (await input.evaluate((node) => node.getBoundingClientRect().bottom)) < bodyTop;
				await input.evaluate((node) => (node as HTMLElement).focus());
				const bandBottom = await heading.evaluate((node) => node.getBoundingClientRect().bottom);
				// A field revealed from out of view lands below the band in every engine. A field already
				// inside the scrollport but partly under the band is moved only where focus honours
				// `scroll-padding`; WebKit leaves it where the user scrolled it.
				if (hidden || page.context().browser()?.browserType().name() === "chromium") {
					await expect
						.poll(() => input.evaluate((node) => node.getBoundingClientRect().top))
						.toBeGreaterThanOrEqual(bandBottom - 0.5);
				}
			}

			if ("transfer" in form) {
				await back.click();
				await expect(methods).toBeVisible();
			}
			await dialog.getByRole("button", { name: "Close", exact: true }).click();
			await expect(dialog).toHaveCount(0);
		}
	});
}

for (const width of [375, 1363]) {
	for (const theme of ["light", "dark"] as const) {
		test(`offers ${theme} card funding as its own deposit method at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: width === 375 ? 666 : 852 });
			await page.goto("/account-actions.html?surface=funds");
			await page.getByRole("button", { name: `Theme ${theme}`, exact: true }).click();
			await page.getByRole("button", { name: "Toggle card funding", exact: true }).click();
			const dialog = page.getByRole("dialog");
			for (const walletKind of ["embedded", "external"] as const) {
				if (walletKind === "external") await page.getByRole("button", { name: "Toggle email", exact: true }).click();
				await page.getByRole("button", { name: "Open deposit", exact: true }).click();
				const methods = dialog.locator('[data-deposit-layout="methods"]');
				await expect(methods.getByRole("heading", { name: "Deposit", exact: true })).toBeVisible();
				const transfer = methods.locator('[data-deposit-method="transfer"]');
				const fiat = methods.locator('[data-deposit-method="fiat"]');
				await expect(transfer).toContainText("Transfer USDC");
				await expect(fiat).toContainText("Buy USDC with a card");
				await expect(fiat.getByText("ETH on Arbitrum", { exact: false })).toHaveCount(walletKind === "external" ? 1 : 0);
				await expect(dialog.getByRole("heading", { name: "Deposit USDC from Arbitrum" })).toHaveCount(0);
				expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
				await expect(fiat).toBeInViewport({ ratio: 1 });
				await expectFundsDialogScroll(page, "Close", "none");
				await page.screenshot({ path: test.info().outputPath(`deposit-methods-${walletKind}-${width}-${theme}.png`) });

				await transfer.click();
				await expect(dialog.getByRole("heading", { name: "Deposit USDC from Arbitrum" })).toBeVisible();
				await expect(dialog.locator('[data-deposit-layout="methods"]')).toHaveCount(0);
				await dialog.getByRole("button", { name: "Close", exact: true }).click();
				await expect(dialog).toHaveCount(0);

				await page.getByRole("button", { name: "Open deposit", exact: true }).click();
				await methods.locator('[data-deposit-method="fiat"]').click();
				await expect(dialog).toHaveCount(0);
			}
			await expect(page.getByRole("status", { name: "Fixture card purchases" })).toHaveText("2");

			await page.getByRole("button", { name: "Toggle data", exact: true }).click();
			await page.getByRole("button", { name: "Open deposit", exact: true }).click();
			await expect(dialog.locator('[data-deposit-method="fiat"]')).toBeDisabled();
			await expect(dialog.locator('[data-deposit-method="transfer"]')).toBeEnabled();
			const notice = dialog.getByRole("alert");
			await expect(notice).toHaveText("Deposits are not available in your region.");
			await expect(notice).toBeInViewport({ ratio: 1 });
			expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
			await page.screenshot({ path: test.info().outputPath(`deposit-methods-unavailable-${width}-${theme}.png`) });
		});
	}
}

for (const width of [375, 393, 1001, 1363]) {
	test(`keeps mode summaries and funding controls consistent at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: width === 375 ? 666 : 852 });
		await page.goto(`/account-actions.html${width <= 1000 ? "?surface=mobile" : ""}`);
		const heading = page.locator(width <= 1000 ? "section h2" : '[data-panel="accountInfo"] section h3');
		for (const mode of [
			{ button: "Unified", en: "Unified Account Summary", zh: "统一账户概要", ratio: "统一账户比率", transfer: false },
			{
				button: "Portfolio mode",
				en: "Portfolio Margin Summary",
				zh: "投资组合保证金概要",
				ratio: "投资组合保证金率",
				transfer: false,
			},
			{
				button: "Manual mode",
				en: "Manual Account Summary",
				zh: "手动账户概要",
				ratio: "账户保证金率",
				transfer: true,
			},
			{ button: "Unresolved mode", en: "Account Summary", zh: "账户概要", ratio: "账户保证金率", transfer: true },
		]) {
			await page.getByRole("button", { name: mode.button, exact: true }).click();
			await expect(heading).toHaveText(mode.en);
			await page.getByRole("button", { name: "中文", exact: true }).click();
			await expect(heading).toHaveText(mode.zh);
			await expect(page.getByRole("progressbar", { name: mode.ratio })).toHaveCount(1);
			await expect(page.getByRole("button", { name: "合约 / 现货", exact: true })).toHaveCount(mode.transfer ? 1 : 0);
			expect(await heading.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
			if (width > 1000) {
				expect(
					await page
						.locator('[data-panel="accountInfo"] [data-slot="info-row-label"]')
						.evaluateAll((labels) => labels.every((e) => e.scrollWidth <= e.clientWidth + 1)),
				).toBe(true);
			}
			await page.getByRole("button", { name: "English", exact: true }).click();
			await expect(heading).toHaveText(mode.en);
		}
		await expect(page.getByRole("status", { name: "Opened funds actions" })).toHaveText("[]");
	});

	test(`preserves mode selection and quiet unavailable state at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: width === 375 ? 666 : 852 });
		await page.goto("/account-actions.html?surface=mode");
		const unified = page.getByRole("button", { name: "Unified account", exact: false });
		await unified.click();
		await expect(unified).toHaveAttribute("aria-pressed", "true");
		await page.getByRole("button", { name: "中文", exact: true }).click();
		await expect(page.getByRole("button", { name: "统一账户", exact: false })).toHaveAttribute("aria-pressed", "true");
		await expect(page.getByRole("button", { name: "手动", exact: false })).toBeVisible();
		await expect(page.getByRole("button", { name: "投资组合保证金", exact: false })).toBeDisabled();
		await expect(page.getByRole("link", { name: "投资组合保证金的准入条件与限额" })).toBeVisible();
		await page.getByRole("button", { name: "Unresolved mode", exact: true }).click();
		await expect(page.getByRole("button", { name: "确认", exact: true })).toBeDisabled();
		await expect(page.locator('[aria-pressed="true"]')).toHaveCount(0);
		await expect(page.getByText("pre-alpha", { exact: false })).toHaveCount(0);
		await expect(page.getByText("无法加载当前账户模式", { exact: false })).toHaveCount(0);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	});
}
