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
				return { pageOverflow: document.documentElement.scrollWidth - window.innerWidth, steps };
			});

			expect(layout.pageOverflow).toBeLessThanOrEqual(0);
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
