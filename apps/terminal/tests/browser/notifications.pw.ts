import { expect, type Page, test } from "@playwright/test";

const feedbackSelector = "[data-order-feedback]";

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
		await expect(feedback).toHaveCount(1);
		await expect(feedback).toContainText("Submitting");
		await expect(page.locator("[data-sonner-toaster]")).toHaveCount(1);
		const original = await feedback.elementHandle();
		expect(original).not.toBeNull();
		await page.getByRole("button", { name: "Fill synthetic order" }).click();
		await expect(feedback).toHaveCount(1);
		await expect(feedback).toContainText("Filled");
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
	await expect(feedback).toContainText("Submitting");
	const taskId = await feedback.getAttribute("data-order-feedback");
	await feedback.getByRole("button", { name: "Dismiss", exact: true }).click();
	await expect(page.getByRole("status", { name: "Queued tasks" })).toHaveText("1");
	await page.getByRole("button", { name: "Fill synthetic order" }).click();
	await expect(feedback).toHaveCount(1);
	await expect(feedback).toHaveAttribute("data-order-feedback", taskId ?? "");
	await expect(feedback).toContainText("Filled");
	await page.waitForTimeout(750);
	await expect(feedback).toHaveCount(1);
	await expect(feedback).toContainText("Filled");
	await expect(feedback).not.toContainText("Submitting");
	await expect(page.getByRole("status", { name: "Queued tasks" })).toHaveText("1");
});

test("hides the initiating account's card and restores its current result", async ({ page }) => {
	await page.getByRole("button", { name: "Submit synthetic order" }).click();
	const feedback = page.locator(feedbackSelector);
	await expect(feedback).toContainText("Submitting");
	await page.getByRole("button", { name: "Switch account" }).click();
	await expect(feedback).toHaveCount(0);
	await page.getByRole("button", { name: "Switch account" }).click();
	await expect(feedback).toHaveCount(1);
	await page.getByRole("button", { name: "Fill synthetic order" }).click();
	await expect(feedback).toContainText("Filled");
	await page.waitForTimeout(750);
	await expect(feedback).toHaveCount(1);
});

for (const viewport of [
	{ width: 1280, height: 900 },
	{ width: 390, height: 844 },
]) {
	test(`shares the Sonner stack within the ${viewport.width}px viewport in both themes`, async ({ page }, testInfo) => {
		await page.setViewportSize(viewport);
		await page.getByRole("button", { name: "Start task", exact: true }).click();
		const feedback = page.locator(feedbackSelector);
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
}
