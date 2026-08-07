// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountModeModal } from "@/components/trade/tradebox/account-mode-modal";

const zhTranslations: Record<string, string> = {
	"Account type": "账户类型",
	"Unified account": "统一账户",
	Recommended: "推荐",
	"Portfolio margin": "投资组合保证金",
	Separate: "分离",
	Current: "当前",
	Unavailable: "不可用",
	"Switch to {selectedModeLabel}": "切换至{selectedModeLabel}",
	"Unable to load the current account mode. Reconnect your wallet and try again.":
		"无法加载当前账户模式。请重新连接钱包后重试。",
};

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const zhMessages: Messages = Object.fromEntries(
	Object.entries(zhTranslations).map(([message, translation]) => [getMessageId(message), translation]),
);

function activateLocale(locale: "en" | "zh") {
	i18n.loadAndActivate({ locale, messages: locale === "zh" ? zhMessages : {} });
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("AccountModeModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		activateLocale("en");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("blocks account mode changes when the current mode is unavailable", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<AccountModeModal open onOpenChange={() => {}} currentMode={null} canChange onApply={vi.fn()} />
				</I18nProvider>,
			),
		);

		const options = [...document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
		expect(options).toHaveLength(3);
		expect(options.every((option) => option.disabled)).toBe(true);
		expect(options.some((option) => option.getAttribute("aria-pressed") === "true")).toBe(false);
		expect(document.body.textContent).toContain(
			"Unable to load the current account mode. Reconnect your wallet and try again.",
		);
		const applyButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Current",
		);
		expect(applyButton?.disabled).toBe(true);
	});

	it("updates interpolated action text without losing the selected mode", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<AccountModeModal open onOpenChange={() => {}} currentMode="disabled" canChange onApply={vi.fn()} />
				</I18nProvider>,
			),
		);

		const unifiedOption = [...document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
			(button) => button.textContent?.includes("Unified account"),
		);
		expect(unifiedOption).toBeDefined();
		act(() => unifiedOption?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

		const actionButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Switch to Unified account",
		);
		expect(actionButton).toBeDefined();
		expect(unifiedOption?.getAttribute("aria-pressed")).toBe("true");

		act(() => activateLocale("zh"));

		expect(actionButton?.textContent?.trim()).toBe("切换至统一账户");
		expect(unifiedOption?.getAttribute("aria-pressed")).toBe("true");
	});

	it("disables new portfolio margin activation and explains the gate", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<AccountModeModal
						open
						onOpenChange={() => {}}
						currentMode="unifiedAccount"
						canChange
						portfolioMarginActivationEnabled={false}
						onApply={vi.fn()}
					/>
				</I18nProvider>,
			),
		);

		const portfolioOption = [...document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
			(button) => button.textContent?.includes("Portfolio margin"),
		);
		expect(portfolioOption?.disabled).toBe(true);
		expect(portfolioOption?.textContent).toContain("Unavailable");
		expect(document.body.textContent).toContain("New portfolio margin activation is temporarily unavailable.");
	});

	it("lets an existing portfolio margin account select another mode when activation is gated", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<AccountModeModal
						open
						onOpenChange={() => {}}
						currentMode="portfolioMargin"
						canChange
						portfolioMarginActivationEnabled={false}
						onApply={vi.fn()}
					/>
				</I18nProvider>,
			),
		);

		const options = [...document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
		const portfolioOption = options.find((button) => button.textContent?.includes("Portfolio margin"));
		const unifiedOption = options.find((button) => button.textContent?.includes("Unified account"));
		expect(portfolioOption?.disabled).toBe(false);
		expect(unifiedOption?.disabled).toBe(false);
	});

	it("resets an unsubmitted account-mode draft after reopening", () => {
		function render(open: boolean) {
			act(() =>
				root.render(
					<I18nProvider i18n={i18n}>
						<AccountModeModal open={open} onOpenChange={() => {}} currentMode="disabled" canChange onApply={vi.fn()} />
					</I18nProvider>,
				),
			);
		}

		render(true);
		const unifiedOption = [...document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
			(button) => button.textContent?.includes("Unified account"),
		);
		act(() => unifiedOption?.click());
		expect(unifiedOption?.getAttribute("aria-pressed")).toBe("true");

		render(false);
		render(true);
		const separateOption = [...document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
			(button) => button.textContent?.includes("Separate"),
		);
		expect(separateOption?.getAttribute("aria-pressed")).toBe("true");
	});

	it("uses the mobile design cards and keeps portfolio guidance below the action", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<AccountModeModal
						open
						onOpenChange={() => {}}
						currentMode="disabled"
						canChange
						portfolioMarginActivationEnabled
						mobileLayout
						onApply={vi.fn()}
					/>
				</I18nProvider>,
			),
		);

		const separateOption = [...document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
			(button) => button.textContent?.includes("Separate"),
		);
		expect(separateOption?.className).toContain("rounded-12");
		expect(separateOption?.className).toContain("border-trading-panel-control");
		expect(separateOption?.textContent).toContain("Current");
		expect(separateOption?.querySelector("svg")).not.toBeNull();
		expect(document.body.textContent).not.toContain("Cancel");

		const unifiedOption = [...document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
			(button) => button.textContent?.includes("Unified account"),
		);
		act(() => unifiedOption?.click());
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Confirm",
		);
		expect(confirmButton?.disabled).toBe(false);
		expect(confirmButton?.className).toContain("bg-trading-panel-control");
		expect(confirmButton?.parentElement?.nextElementSibling?.textContent).toContain(
			"Hyperliquid labels portfolio margin as pre-alpha",
		);
	});
});
