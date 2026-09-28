import { expect, type Page, test } from "@playwright/test";
import type { UserMenuRecoverySession } from "./user-menu-recovery.browser";

const walletPending: Partial<UserMenuRecoverySession> = {
	authenticationReady: true,
	walletDirectoryReady: false,
	authenticated: true,
	sessionMode: "wallet",
	user: { id: "fixture-user-a", email: { address: "fixture@example.test" } },
};

async function setSession(page: Page, patch: Partial<UserMenuRecoverySession>) {
	await page.evaluate((value) => window.__gatuUserMenuRecovery.setSession(value), patch);
}

async function setup(page: Page) {
	const failures: string[] = [];
	page.on("pageerror", (error) => failures.push(error.message));
	await page.clock.install();
	await page.goto("/user-menu-recovery.html");
	await expect(page.getByRole("button", { name: "Connecting...", exact: true })).toBeDisabled();
	return failures;
}

for (const width of [390, 1333]) {
	const desktop = width > 1000;
	const connectLabel = desktop ? "Connect Wallet" : "Connect";
	const accountLabel = (email: string) => (desktop ? email : email.slice(0, email.indexOf("@")));

	test.describe(`user menu readiness at ${width}px`, () => {
		test.use({ viewport: { width, height: 900 } });

		test("offers a localized explicit reload after authentication stalls without reloading automatically", async ({
			page,
		}) => {
			let navigations = 0;
			page.on("request", (request) => {
				if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations += 1;
			});
			const failures = await setup(page);
			const draft = page.getByLabel("Order quantity draft");
			await draft.fill("0.125");
			const draftNode = await draft.elementHandle();
			await page.evaluate(() => window.__gatuUserMenuRecovery.setLocale("zh"));
			await expect(page.getByRole("button", { name: "连接中...", exact: true })).toBeDisabled();
			const initialNavigations = navigations;
			await page.clock.fastForward(30_001);
			const reload = page.getByRole("button", { name: "重新加载页面", exact: true });
			await expect(reload).toBeEnabled();
			await expect(draft).toHaveValue("0.125");
			expect(await draft.evaluate((node, original) => node === original, draftNode)).toBe(true);
			expect(navigations).toBe(initialNavigations);
			await reload.click();
			await expect.poll(() => navigations).toBe(initialNavigations + 1);
			expect(failures).toEqual([]);
		});

		test("keeps the authenticated dropdown operable while wallets load and reloads only on selection", async ({
			page,
		}) => {
			let navigations = 0;
			page.on("request", (request) => {
				if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations += 1;
			});
			const failures = await setup(page);
			await setSession(page, walletPending);
			const account = page.getByRole("button", { name: "Account and wallet", exact: true });
			await expect(account).toContainText(accountLabel("fixture@example.test"));
			if (!desktop) await expect(page.locator('[title="fixture@example.test"]')).toHaveCount(1);
			await account.focus();
			await account.press("ArrowDown");
			await expect(page.getByRole("menuitem", { name: "Reconnect wallet", exact: true })).toBeDisabled();
			const disconnect = page.getByRole("menuitem", { name: "Disconnect", exact: true });
			await expect(disconnect).toBeDisabled();
			await expect(page.getByRole("menuitem", { name: "Reload page", exact: true })).toHaveCount(0);
			const menuBounds = await page.getByRole("menu").boundingBox();
			if (!menuBounds) throw new Error("Expected visible account menu");
			expect(menuBounds.x).toBeGreaterThanOrEqual(0);
			expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(width);
			const initialNavigations = navigations;
			await page.clock.fastForward(30_001);
			const reload = page.getByRole("menuitem", { name: "Reload page", exact: true });
			await expect(reload).toBeEnabled();
			expect(navigations).toBe(initialNavigations);
			expect(await page.evaluate(() => window.__gatuUserMenuRecovery.calls.reconnect)).toBe(0);
			expect(await page.evaluate(() => window.__gatuUserMenuRecovery.calls.disconnect)).toBe(0);
			await page.keyboard.press("Home");
			const exportWallet = page.getByRole("menuitem", { name: "Export email wallet", exact: true });
			await expect(exportWallet).toBeFocused();
			await expect(exportWallet).toBeDisabled();
			await page.keyboard.press("Enter");
			expect(navigations).toBe(initialNavigations);
			await page.keyboard.press("ArrowDown");
			await expect(page.getByRole("menuitem", { name: "Reconnect wallet", exact: true })).toBeFocused();
			await page.keyboard.press("Enter");
			expect(await page.evaluate(() => window.__gatuUserMenuRecovery.calls.reconnect)).toBe(0);
			await page.keyboard.press("ArrowDown");
			await expect(reload).toBeFocused();
			await page.keyboard.press("Enter");
			await expect.poll(() => navigations).toBe(initialNavigations + 1);
			expect(failures).toEqual([]);
		});

		test("recovers late wallets in place, preserves drafts, and updates open-menu translations", async ({ page }) => {
			const failures = await setup(page);
			await setSession(page, { ...walletPending, user: { id: "fixture-user-a" } });
			const account = page.getByRole("button", { name: "Account and wallet", exact: true });
			await expect(account).toContainText("Account");
			const accountNode = await account.elementHandle();
			const draft = page.getByLabel("Order quantity draft");
			await draft.fill("3.1415");
			const draftNode = await draft.elementHandle();
			const neutralDot = await account
				.locator("span[aria-hidden]")
				.first()
				.evaluate((node) => getComputedStyle(node).backgroundColor);
			await account.click();
			await page.clock.fastForward(30_001);
			await expect(page.getByRole("menuitem", { name: "Reload page", exact: true })).toBeVisible();
			await setSession(page, { walletDirectoryReady: true });
			await expect(page.getByRole("menuitem", { name: "Reload page", exact: true })).toHaveCount(0);
			const reconnect = page.getByRole("menuitem", { name: "Reconnect wallet", exact: true });
			await expect(reconnect).toBeEnabled();
			await reconnect.click();
			await expect.poll(() => page.evaluate(() => window.__gatuUserMenuRecovery.calls.reconnect)).toBe(1);
			await account.click();
			await setSession(page, {
				walletDirectoryReady: true,
				hasWalletAccess: true,
				isConnected: true,
				displayAddress: "0x1111111111111111111111111111111111111111",
			});
			await expect(page.getByRole("menuitem", { name: "Reload page", exact: true })).toHaveCount(0);
			await expect(page.getByRole("menuitem", { name: "Reconnect wallet", exact: true })).toHaveCount(0);
			await expect(page.getByRole("menuitem", { name: "Copy Address", exact: true })).toBeEnabled();
			expect(await page.evaluate(() => window.__gatuUserMenuRecovery.pairingEnabled)).toBe(true);
			await expect(page.getByRole("menuitem", { name: "Link mobile device", exact: true })).toHaveCount(0);
			const connectedDot = await account
				.locator("span[aria-hidden]")
				.first()
				.evaluate((node) => getComputedStyle(node).backgroundColor);
			expect(connectedDot).not.toBe(neutralDot);
			await page.evaluate(() => window.__gatuUserMenuRecovery.setLocale("zh"));
			const localizedAccount = page.getByRole("button", { name: "账户与钱包", exact: true });
			await expect(page.getByRole("menuitem", { name: "复制地址", exact: true })).toBeEnabled();
			expect(await localizedAccount.evaluate((node, original) => node === original, accountNode)).toBe(true);
			expect(await draft.evaluate((node, original) => node === original, draftNode)).toBe(true);
			await expect(draft).toHaveValue("3.1415");
			const screenshotPath = test.info().outputPath("recovered-account-menu.png");
			await page.screenshot({ path: screenshotPath });
			await test.info().attach("recovered-account-menu", { path: screenshotPath, contentType: "image/png" });
			const disconnect = page.getByRole("menuitem", { name: "断开连接", exact: true });
			await expect(disconnect).toBeEnabled();
			await page.keyboard.press("End");
			await expect(disconnect).toBeFocused();
			await page.keyboard.press("Enter");
			await expect.poll(() => page.evaluate(() => window.__gatuUserMenuRecovery.calls.disconnect)).toBe(1);
			if (desktop) {
				await page.evaluate(() => window.__gatuUserMenuRecovery.openLinkMobileDevice());
				const linkMobile = page.getByRole("dialog", { name: "Fixture mobile link" });
				await expect(linkMobile).toHaveCount(1);
				await linkMobile.getByRole("button", { name: "Close fixture mobile link" }).click();
				await expect(linkMobile).toHaveCount(0);
				expect(await localizedAccount.evaluate((node, original) => node === original, accountNode)).toBe(true);
				await expect(draft).toHaveValue("3.1415");
			}
			await localizedAccount.click();
			await setSession(page, { walletDirectoryReady: false, hasWalletAccess: false, isConnected: false });
			await expect(page.getByRole("menuitem", { name: "重新连接钱包", exact: true })).toBeDisabled();
			await expect(page.getByRole("menuitem", { name: "重新加载页面", exact: true })).toHaveCount(0);
			await page.clock.fastForward(29_000);
			await expect(page.getByRole("menuitem", { name: "重新加载页面", exact: true })).toHaveCount(0);
			await page.clock.fastForward(1_001);
			await expect(page.getByRole("menuitem", { name: "重新加载页面", exact: true })).toBeEnabled();
			expect(failures).toEqual([]);
		});

		test("allows unauthenticated Connect Wallet and preserves the Agent-only account menu", async ({ page }) => {
			const failures = await setup(page);
			await setSession(page, { authenticationReady: true });
			const connect = page.getByRole("button", { name: connectLabel, exact: true });
			await expect(connect).toBeEnabled();
			await connect.click();
			await expect(page.getByRole("dialog", { name: "Fixture wallet connector" })).toBeVisible();
			await page.getByRole("button", { name: "Close fixture connector" }).click();
			await setSession(page, {
				authenticationReady: false,
				isConnected: true,
				sessionMode: "agent-only",
				displayAddress: "0x1111111111111111111111111111111111111111",
			});
			const account = page.getByRole("button", { name: "Account and wallet", exact: true });
			await account.press("ArrowDown");
			await expect(page.getByRole("menuitem", { name: "Copy Address", exact: true })).toBeEnabled();
			await page.clock.fastForward(30_001);
			await expect(page.getByRole("menuitem", { name: "Reload page", exact: true })).toHaveCount(0);
			await expect(page.getByRole("menuitem", { name: "Reconnect wallet", exact: true })).toHaveCount(0);
			expect(await page.evaluate(() => window.__gatuUserMenuRecovery.calls.reconnect)).toBe(0);
			expect(failures).toEqual([]);
		});

		test("restarts recovery timing across authentication phase and account identity changes", async ({ page }) => {
			const failures = await setup(page);
			await page.clock.fastForward(29_000);
			await setSession(page, walletPending);
			const account = page.getByRole("button", { name: "Account and wallet", exact: true });
			await account.click();
			await page.clock.fastForward(2_000);
			await expect(page.getByRole("menuitem", { name: "Reload page", exact: true })).toHaveCount(0);
			await page.clock.fastForward(28_001);
			await expect(page.getByRole("menuitem", { name: "Reload page", exact: true })).toBeVisible();
			await setSession(page, { user: { id: "fixture-user-b", email: { address: "second@example.test" } } });
			await expect(account).toContainText(accountLabel("second@example.test"));
			await expect(page.getByRole("menuitem", { name: "Reload page", exact: true })).toHaveCount(0);
			await page.clock.fastForward(29_000);
			await expect(page.getByRole("menuitem", { name: "Reload page", exact: true })).toHaveCount(0);
			await page.clock.fastForward(1_001);
			await expect(page.getByRole("menuitem", { name: "Reload page", exact: true })).toBeEnabled();
			expect(failures).toEqual([]);
		});
	});
}
