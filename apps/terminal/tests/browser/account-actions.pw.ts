import { expect, type Page, test } from "@playwright/test";

async function readGridGeometry(page: Page) {
	return page.locator("[data-panel]").evaluateAll((panels) =>
		panels.map((panel) => {
			const { x, y, width, height } = panel.getBoundingClientRect();
			return { name: panel.getAttribute("data-panel"), x, y, width, height };
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
				const heading = element.querySelector("h2");
				if (!buttons || buttons.length < 3 || !section || !metrics || !table || !heading) return ["missing regions"];
				const [deposit, withdraw, transfer] = [...buttons].map((button) => button.getBoundingClientRect());
				const metricRect = metrics.getBoundingClientRect();
				const headingRect = heading.getBoundingClientRect();
				const tableRect = table.getBoundingClientRect();
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
				if (Math.abs(tableRect.y - panel.y) > 1 || Math.abs(tableRect.bottom - panel.bottom) > 1)
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
	await expect(transfer).toBeDisabled();
	await transfer.evaluate((button) => (button as HTMLButtonElement).click());
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
