import { expect, test } from "@playwright/test";

for (const locale of ["en", "zh", "fr", "es", "hi", "ar"]) {
	for (const viewport of [
		{ width: 320, height: 640 },
		{ width: 375, height: 812 },
	]) {
		test(`shows every referral step label in full at ${viewport.width}px in ${locale}`, async ({ page }) => {
			const errors: string[] = [];
			page.on("pageerror", (error) => errors.push(error.message));
			await page.setViewportSize(viewport);
			await page.goto(`/referral-code-card.html?locale=${locale}`);
			await expect(page.locator("ol > li")).toHaveCount(3);
			await page.evaluate(async () => {
				await document.fonts.ready;
			});

			const layout = await page.evaluate(() => {
				const steps = [...document.querySelectorAll<HTMLLIElement>("ol > li")].map((step) => {
					const label = step.querySelector("p");
					if (!label) throw new Error("Missing step label");
					const stepBox = step.getBoundingClientRect();
					const labelBox = label.getBoundingClientRect();
					const style = getComputedStyle(step);
					return {
						text: label.textContent ?? "",
						truncated: label.scrollWidth > label.clientWidth || getComputedStyle(label).textOverflow === "ellipsis",
						startOverflow: stepBox.left + Number.parseFloat(style.paddingLeft) - labelBox.left,
						endOverflow: labelBox.right - (stepBox.right - Number.parseFloat(style.paddingRight)),
						bottomOverflow: labelBox.bottom - stepBox.bottom,
					};
				});
				const card = document.querySelector("article");
				const column = card?.parentElement?.parentElement;
				if (!card || !column) throw new Error("Missing referral card column");
				const cardBox = card.getBoundingClientRect();
				const columnBox = column.getBoundingClientRect();
				const columnStyle = getComputedStyle(column);
				const cardOverflow = Math.max(
					cardBox.right - (columnBox.right - Number.parseFloat(columnStyle.paddingRight)),
					columnBox.left + Number.parseFloat(columnStyle.paddingLeft) - cardBox.left,
				);
				return { pageOverflow: document.documentElement.scrollWidth - window.innerWidth, cardOverflow, steps };
			});

			expect(layout.pageOverflow).toBeLessThanOrEqual(0);
			expect(layout.cardOverflow).toBeLessThanOrEqual(0.5);
			for (const step of layout.steps) {
				expect(step.text.length, locale).toBeGreaterThan(0);
				expect(step.truncated, step.text).toBe(false);
				expect(step.startOverflow, step.text).toBeLessThanOrEqual(0.5);
				expect(step.endOverflow, step.text).toBeLessThanOrEqual(0.5);
				expect(step.bottomOverflow, step.text).toBeLessThanOrEqual(0);
			}
			expect(errors).toEqual([]);
		});
	}
}

const LONG_CODE = "WMWMWMWMWMWMWMWMWMWM";

for (const viewport of [
	{ width: 320, height: 640 },
	{ width: 360, height: 780 },
	{ width: 375, height: 812 },
]) {
	test(`shows a 20-character referral code in full at ${viewport.width}px`, async ({ page }) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.setViewportSize(viewport);
		await page.goto(`/referral-code-card.html?code=${LONG_CODE}`);
		const code = page.getByText(LONG_CODE, { exact: true });
		await expect(code).toBeVisible();
		await page.evaluate(async () => {
			await document.fonts.ready;
		});

		const geometry = await code.evaluate((element) => {
			const box = element.getBoundingClientRect();
			const field = element.parentElement?.getBoundingClientRect();
			const card = element.closest("article");
			const column = card?.parentElement?.parentElement;
			if (!field || !card || !column) throw new Error("Missing referral code field");
			const cardBox = card.getBoundingClientRect();
			const columnBox = column.getBoundingClientRect();
			const columnStyle = getComputedStyle(column);
			return {
				hidden: element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight,
				endOverflow: box.right - field.right,
				cardOverflow: Math.max(
					cardBox.right - (columnBox.right - Number.parseFloat(columnStyle.paddingRight)),
					columnBox.left + Number.parseFloat(columnStyle.paddingLeft) - cardBox.left,
				),
				pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
			};
		});
		expect(geometry.hidden).toBe(false);
		expect(geometry.endOverflow).toBeLessThanOrEqual(0);
		expect(geometry.cardOverflow).toBeLessThanOrEqual(0.5);
		expect(geometry.pageOverflow).toBeLessThanOrEqual(0);
		expect(errors).toEqual([]);
	});

	test(`keeps at least two characters on every line of a Chinese step label at ${viewport.width}px`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.goto("/referral-code-card.html?locale=zh");
		await expect(page.locator("ol > li")).toHaveCount(3);
		await page.evaluate(async () => {
			await document.fonts.ready;
		});

		const labels = await page.evaluate(() =>
			[...document.querySelectorAll<HTMLParagraphElement>("ol > li p")].map((label) => {
				const text = label.firstChild;
				if (!text || text.nodeType !== Node.TEXT_NODE) throw new Error("Missing step label text");
				const charactersPerLine = new Map<number, number>();
				for (let index = 0; index < (text.textContent ?? "").length; index++) {
					const range = document.createRange();
					range.setStart(text, index);
					range.setEnd(text, index + 1);
					const top = Math.round(range.getBoundingClientRect().top);
					charactersPerLine.set(top, (charactersPerLine.get(top) ?? 0) + 1);
				}
				return { text: label.textContent ?? "", charactersPerLine: [...charactersPerLine.values()] };
			}),
		);
		expect(labels.map((label) => label.text)).toEqual(["交易", "创建推荐码", "邀请交易者"]);
		for (const label of labels) {
			expect(Math.min(...label.charactersPerLine), label.text).toBeGreaterThanOrEqual(2);
		}
	});
}
