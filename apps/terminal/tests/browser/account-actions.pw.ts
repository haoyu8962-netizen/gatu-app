import { expect, type Page, test } from "@playwright/test";

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
