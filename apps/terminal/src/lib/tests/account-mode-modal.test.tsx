import { clearFeedback, feedbackErrorText, feedbackText, latestFeedback } from "./harness/order-feedback";
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
	Manual: "手动",
	Current: "当前",
	Unavailable: "不可用",
	Confirm: "确认",
	"Failed to update account mode": "更新账户模式失败",
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

const feedbackIdentity = vi.hoisted(() => ({
	clientKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	env: "Mainnet",
}));
vi.mock("@/lib/hyperliquid", () => ({ useHyperliquid: () => feedbackIdentity }));

describe("AccountModeModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		feedbackIdentity.clientKey = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		feedbackIdentity.env = "Mainnet";
		clearFeedback();
		activateLocale("en");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		clearFeedback();
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
		expect(document.body.textContent).not.toContain(
			"Unable to load the current account mode. Reconnect your wallet and try again.",
		);
		const applyButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Confirm",
		);
		expect(applyButton?.disabled).toBe(true);
	});

	it("uses the trading scrim and market-close typography without changing the shared modal", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<AccountModeModal open onOpenChange={() => {}} currentMode="disabled" canChange onApply={vi.fn()} />
				</I18nProvider>,
			),
		);

		const popup = document.body.querySelector<HTMLElement>('[role="dialog"]');
		expect(popup?.className).toContain("font-market-close");
		expect(document.body.querySelector(".bg-trading-panel-scrim")).not.toBeNull();
	});

	it("allows only one account-mode mutation and closes at the click without a progress label", async () => {
		let resolveApply: (() => void) | undefined;
		const onApply = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveApply = resolve;
				}),
		);
		const onOpenChange = vi.fn();
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<AccountModeModal open onOpenChange={onOpenChange} currentMode="disabled" canChange onApply={onApply} />
				</I18nProvider>,
			),
		);

		const unifiedOption = [...document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
			(button) => button.textContent?.includes("Unified account"),
		);
		act(() => unifiedOption?.click());
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Confirm",
		);
		act(() => {
			confirmButton?.click();
			confirmButton?.click();
		});

		expect(onApply).toHaveBeenCalledTimes(1);
		expect(onOpenChange).toHaveBeenCalledOnce();
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(document.body.textContent).not.toContain("Switching");
		expect(document.body.querySelector(".animate-spin")).toBeNull();

		await act(async () => resolveApply?.());
		expect(onOpenChange).toHaveBeenCalledOnce();
		expect(latestFeedback("failed")).toBeUndefined();
	});

	it("requires an explicit supported selection for the protocol default", async () => {
		const onApply = vi.fn().mockResolvedValue(undefined);
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<AccountModeModal open onOpenChange={() => {}} currentMode="default" canChange onApply={onApply} />
				</I18nProvider>,
			),
		);

		const options = [...document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
		expect(options.every((option) => !option.disabled)).toBe(false);
		const unifiedOption = options.find((button) => button.textContent?.includes("Unified account"));
		expect(unifiedOption?.disabled).toBe(false);
		expect(options.some((option) => option.getAttribute("aria-pressed") === "true")).toBe(false);
		expect(document.body.textContent).toContain(
			"Select a supported account mode before using balances or moving funds.",
		);

		act(() => unifiedOption?.click());
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Confirm",
		);
		await act(async () => confirmButton?.click());
		expect(onApply).toHaveBeenCalledWith("unifiedAccount");
	});

	it("updates translated action text without losing the selected mode", () => {
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
			(button) => button.textContent?.trim() === "Confirm",
		);
		expect(actionButton).toBeDefined();
		expect(actionButton?.disabled).toBe(false);
		expect(unifiedOption?.getAttribute("aria-pressed")).toBe("true");

		act(() => activateLocale("zh"));

		expect(actionButton?.textContent?.trim()).toBe("确认");
		expect(unifiedOption?.getAttribute("aria-pressed")).toBe("true");
	});

	it.each([
		[undefined, "Failed to update account mode"],
		[new Error("Wallet is not ready to update account mode"), "Wallet is not ready to update account mode"],
	])("reports a failed switch through a notification after the dialog closed", async (cause, message) => {
		const onApply = vi.fn().mockRejectedValue(cause);
		const onOpenChange = vi.fn();
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<AccountModeModal open onOpenChange={onOpenChange} currentMode="disabled" canChange onApply={onApply} />
				</I18nProvider>,
			),
		);

		const unifiedOption = [...document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
			(button) => button.textContent?.includes("Unified account"),
		);
		act(() => unifiedOption?.click());
		const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Confirm",
		);
		await act(async () => {
			confirmButton?.click();
			await Promise.resolve();
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(feedbackErrorText(latestFeedback("failed")) || feedbackText("failed")).toBe(message);
		expect(document.body.textContent).not.toContain(message);
		expect(onApply).toHaveBeenCalledOnce();
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
		expect(document.body.textContent).toContain("This terminal has not enabled new portfolio margin activation.");
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
			(button) => button.textContent?.includes("Manual"),
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
			(button) => button.textContent?.includes("Manual"),
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
			"Portfolio margin eligibility and limits",
		);
	});

	it.each(["success", "failed"] as const)(
		"keeps a late %s result scoped after the account form unmounts",
		async (status) => {
			let settle: (() => void) | undefined;
			const onApply = vi.fn(
				() =>
					new Promise<void>((resolve, reject) => {
						settle = () => (status === "success" ? resolve() : reject(new Error("Request rejected")));
					}),
			);
			const onOpenChange = vi.fn();
			act(() =>
				root.render(
					<I18nProvider i18n={i18n}>
						<AccountModeModal open onOpenChange={onOpenChange} currentMode="disabled" canChange onApply={onApply} />
					</I18nProvider>,
				),
			);
			const option = [...document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find((button) =>
				button.textContent?.includes("Unified account"),
			);
			act(() => option?.click());
			const confirm = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
				(button) => button.textContent?.trim() === "Confirm",
			);
			act(() => confirm?.click());
			const pendingId = latestFeedback("pending")?.id;
			expect(pendingId).toBeDefined();

			feedbackIdentity.clientKey = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
			feedbackIdentity.env = "Testnet";
			act(() => root.render(null));
			await act(async () => settle?.());
			expect(latestFeedback(status)).toMatchObject({
				id: pendingId,
				owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				env: "Mainnet",
			});
			expect(onApply).toHaveBeenCalledOnce();
			expect(onOpenChange).toHaveBeenCalledOnce();
		},
	);
});
