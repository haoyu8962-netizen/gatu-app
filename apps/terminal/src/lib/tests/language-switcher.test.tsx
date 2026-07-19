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
	dynamicActivate: vi.fn(async () => {}),
}));

const settingsState = vi.hoisted(() => ({
	numberFormatLocale: "auto",
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

describe("LanguageSwitcher", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.clearAllMocks();
		activateLocale("en");
		settingsState.numberFormatLocale = "auto";
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

		const menuItems = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')];
		const englishItem = menuItems.find((item) => item.textContent?.trim() === "English");
		const chineseItem = menuItems.find((item) => item.textContent?.trim() === "中文");
		expect(englishItem?.getAttribute("aria-current")).toBeNull();
		expect(chineseItem?.getAttribute("aria-current")).toBe("true");

		await act(async () => chineseItem?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(dynamicActivate).not.toHaveBeenCalled();

		await act(async () => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		const reopenedEnglishItem = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
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
		const germanFormat = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
			item.textContent?.includes("German - 1.234,56"),
		);

		await act(async () => germanFormat?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

		expect(settingsState.setNumberFormatLocale).toHaveBeenCalledWith("de-DE");
		expect(dynamicActivate).not.toHaveBeenCalled();
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
