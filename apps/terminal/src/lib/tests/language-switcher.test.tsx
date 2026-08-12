// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "@/components/trade/header/language-switcher";
import { MobileBottomNav } from "@/components/trade/mobile/mobile-bottom-nav";
import { dynamicActivate } from "@/lib/i18n";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const zhMessages: Messages = Object.fromEntries(
	Object.entries({
		Language: "语言",
		"Language and number format": "语言和数字格式",
		"Number format": "数字格式",
		Reset: "重置",
		"Primary navigation": "主导航",
		Markets: "市场",
		Trade: "交易",
		Account: "账户",
	}).map(([message, translation]) => [getMessageId(message), translation]),
);

vi.mock("@/lib/i18n", () => ({
	dynamicActivate: vi.fn(async () => true),
}));

const settingsState = vi.hoisted(() => ({
	numberFormatLocale: "en-US",
	setNumberFormatLocale: vi.fn((locale: string) => {
		settingsState.numberFormatLocale = locale;
	}),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useGlobalSettings: () => ({ numberFormatLocale: settingsState.numberFormatLocale }),
	useGlobalSettingsActions: () => ({ setNumberFormatLocale: settingsState.setNumberFormatLocale }),
}));

function activateLocale(locale: "en" | "zh") {
	i18n.loadAndActivate({ locale, messages: locale === "zh" ? zhMessages : {} });
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"]';

describe("LanguageSwitcher", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.clearAllMocks();
		activateLocale("en");
		settingsState.numberFormatLocale = "en-US";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("moves the selected state when the locale changes", async () => {
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<LanguageSwitcher />
				</I18nProvider>,
			);
		});

		await act(async () => activateLocale("zh"));
		const trigger = container.querySelector<HTMLElement>('[aria-label="语言和数字格式"]');
		expect(trigger).not.toBeNull();

		await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

		const menuItems = [...document.body.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)];
		const englishItem = menuItems.find((item) => item.textContent?.trim() === "English");
		const chineseItem = menuItems.find((item) => item.textContent?.trim() === "简体中文");
		expect(englishItem?.getAttribute("aria-checked")).toBe("false");
		expect(chineseItem?.getAttribute("aria-checked")).toBe("true");

		await act(async () => chineseItem?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(dynamicActivate).not.toHaveBeenCalled();

		await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		const reopenedEnglishItem = [...document.body.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)].find(
			(item) => item.textContent?.trim() === "English",
		);
		await act(async () => reopenedEnglishItem?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(dynamicActivate).toHaveBeenCalledWith("en");
	});

	it("updates the number format independently of the interface language", async () => {
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<LanguageSwitcher />
				</I18nProvider>,
			);
		});

		const trigger = container.querySelector<HTMLElement>('[aria-label="Language and number format"]');
		await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		const germanFormat = [...document.body.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)].find(
			(item) => item.textContent?.trim() === "1.234,56",
		);

		await act(async () => germanFormat?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

		expect(settingsState.setNumberFormatLocale).toHaveBeenCalledWith("de-DE");
		expect(dynamicActivate).not.toHaveBeenCalled();
	});

	it("uses the available viewport height before scrolling", async () => {
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<LanguageSwitcher />
				</I18nProvider>,
			);
		});

		const trigger = container.querySelector<HTMLElement>('[aria-label="Language and number format"]');
		await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

		const menu = document.body.querySelector<HTMLElement>('[role="menu"]');
		expect(menu?.classList.contains("max-h-[calc(100dvh-4rem)]")).toBe(true);
	});

	it("matches the responsive language-settings surface and concise format list", async () => {
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<LanguageSwitcher />
				</I18nProvider>,
			);
		});

		const trigger = container.querySelector<HTMLElement>('[aria-label="Language and number format"]');
		await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

		const menu = document.body.querySelector<HTMLElement>('[role="menu"]');
		expect(menu?.classList).toContain("w-[232px]");
		expect(menu?.classList).toContain("min-[1001px]:w-[224px]");
		expect(menu?.classList).toContain("!rounded-[12px]");
		expect(menu?.classList).toContain("!shadow-language-settings");
		expect(menu?.classList).toContain("data-starting-style:!scale-100");
		expect(menu?.classList).toContain("max-[1000px]:[&_[role^=menuitem]]:min-h-11");
		expect(menu?.classList).toContain("[&>[role=group]:first-child_[role^=menuitem]>span]:[direction:ltr]");

		const menuLabels = [...document.body.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)].map((item) =>
			item.textContent?.trim(),
		);
		expect(menuLabels.slice(0, 3)).toEqual(["1,234.56", "1.234,56", "1 234,56"]);
		expect(menuLabels).not.toContain("Auto (Follow Language)");
		expect(menuLabels).toContain("简体中文");
		expect(menuLabels).toContain("العربية");
		const resetItem = [...document.body.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)].find(
			(item) => item.textContent?.trim() === "Reset",
		);
		expect(resetItem?.getAttribute("aria-disabled")).toBe("true");
	});

	it("optionally shows the active language in the desktop trigger", async () => {
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<LanguageSwitcher showLabel />
				</I18nProvider>,
			);
		});

		const trigger = container.querySelector<HTMLElement>('[aria-label="Language and number format"]');
		expect(trigger?.textContent).toBe("English");

		await act(async () => activateLocale("zh"));

		expect(trigger?.getAttribute("aria-label")).toBe("语言和数字格式");
		expect(trigger?.textContent).toBe("简体中文");
	});

	it("does not change the number format when the interface language changes", async () => {
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<LanguageSwitcher />
				</I18nProvider>,
			);
		});

		const trigger = container.querySelector<HTMLElement>('[aria-label="Language and number format"]');
		await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		const frenchItem = [...document.body.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)].find(
			(item) => item.textContent?.trim() === "Français",
		);

		await act(async () => frenchItem?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

		expect(dynamicActivate).toHaveBeenCalledWith("fr");
		expect(settingsState.setNumberFormatLocale).not.toHaveBeenCalled();
	});

	it("resets language and number format together after language activation succeeds", async () => {
		activateLocale("zh");
		settingsState.numberFormatLocale = "de-DE";
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<LanguageSwitcher />
				</I18nProvider>,
			);
		});

		const trigger = container.querySelector<HTMLElement>('[aria-label="语言和数字格式"]');
		await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		const resetItem = [...document.body.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)].find(
			(item) => item.textContent?.trim() === "重置",
		);

		await act(async () => resetItem?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

		expect(dynamicActivate).toHaveBeenCalledWith("en");
		expect(settingsState.setNumberFormatLocale).toHaveBeenCalledWith("en-US");
	});

	it("keeps the number format when a superseded reset cannot restore English", async () => {
		activateLocale("zh");
		settingsState.numberFormatLocale = "de-DE";
		vi.mocked(dynamicActivate).mockResolvedValueOnce(false);
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<LanguageSwitcher />
				</I18nProvider>,
			);
		});

		const trigger = container.querySelector<HTMLElement>('[aria-label="语言和数字格式"]');
		await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		const resetItem = [...document.body.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)].find(
			(item) => item.textContent?.trim() === "重置",
		);

		await act(async () => resetItem?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

		expect(dynamicActivate).toHaveBeenCalledWith("en");
		expect(settingsState.setNumberFormatLocale).not.toHaveBeenCalled();
	});

	it("updates the mounted mobile navigation when the locale changes", async () => {
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileBottomNav activeTab="markets" onTabChange={() => {}} />
				</I18nProvider>,
			);
		});

		const originalNavigation = container.querySelector<HTMLElement>('[aria-label="Primary navigation"]');
		expect(originalNavigation?.textContent).toContain("Markets");

		await act(async () => activateLocale("zh"));

		const localizedNavigation = container.querySelector<HTMLElement>('[aria-label="主导航"]');
		expect(localizedNavigation).toBe(originalNavigation);
		expect(localizedNavigation?.textContent).toContain("市场");
		expect(localizedNavigation?.textContent).toContain("交易");
		expect(localizedNavigation?.textContent).toContain("账户");
	});
});
