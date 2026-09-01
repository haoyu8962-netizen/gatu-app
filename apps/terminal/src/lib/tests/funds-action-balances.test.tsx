// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { act, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SendModal } from "@/components/trade/positions/send-modal";
import { TransferModal } from "@/components/trade/positions/transfer-modal";
import { AccountAbstractionExecutionError } from "@/hooks/trade/use-account-abstraction-guard";
import { FundsActionGeoExecutionError } from "@/hooks/trade/use-funds-action-availability";
import { createI18nRoot } from "./harness/react";

const BALANCE_UNAVAILABLE = "Balance data is unavailable. Try again after the connection recovers.";
const BALANCE_UNAVAILABLE_AR = "بيانات الرصيد غير متاحة. حاول مرة أخرى بعد استعادة الاتصال.";
const BALANCE_CHANGED = "Balance changed before submission. Review the updated balance and try again.";
const BALANCE_CHANGED_AR = "تغيّر الرصيد قبل الإرسال. راجع الرصيد المحدّث وحاول مرة أخرى.";
const ACCOUNT_MODE_CHANGED = "Account mode changed before the request was submitted. Review balances and try again.";
const ACCOUNT_MODE_CHANGED_AR = "تغيّر وضع الحساب قبل إرسال الطلب. راجع الأرصدة وحاول مرة أخرى.";
const GEO_UNAVAILABLE = "Unable to verify regional availability. This funds action was not submitted.";
const GEO_UNAVAILABLE_AR = "تعذّر التحقق من التوفر في منطقتك. لم يتم إرسال عملية إدارة الأموال هذه.";
const RAW_EXCHANGE_ERROR = "Exchange rejected the funds action with code TEST-RAW";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(BALANCE_UNAVAILABLE)]: BALANCE_UNAVAILABLE_AR,
	[getMessageId(BALANCE_CHANGED)]: BALANCE_CHANGED_AR,
	[getMessageId(ACCOUNT_MODE_CHANGED)]: ACCOUNT_MODE_CHANGED_AR,
	[getMessageId(GEO_UNAVAILABLE)]: GEO_UNAVAILABLE_AR,
};

const testState = vi.hoisted(() => ({
	balances: {
		accountAbstraction: "disabled",
		marginSummary: {
			accountValue: "1620.34",
			totalMarginUsed: "1564.34",
			totalRawUsd: "1620.34",
		},
		perpSummary: {
			accountValue: "1620.34",
			totalMarginUsed: "1564.34",
		},
		spotAvailableAfterMaintenance: [[0, "4947.18019669"]],
		spotBalances: [
			{
				coin: "USDC",
				entryNtl: "0",
				hold: "3140.833333",
				token: 0,
				total: "8105.34686269",
			},
		],
		withdrawable: "40",
		spotStateStatus: "success",
		perpStateStatus: "success",
		spotStateReceivedAt: Date.now(),
		perpStateReceivedAt: Date.now(),
		isDataStale: false,
		hasError: false,
	},
	exchangeMutations: {
		sendAsset: vi.fn(),
		spotSend: vi.fn(),
		usdClassTransfer: vi.fn(),
	},
	exchangeGuards: new Map<string, (_params: unknown, signal: AbortSignal) => Promise<void>>(),
	runGuardsOnMutation: false,
	assertAccountAbstraction: vi.fn(),
	assertFreshGeoAllowed: vi.fn(),
}));

function renderChildren(children: ReactNode) {
	return createElement(Fragment, null, children);
}

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? createElement("section", null, children) : null,
	Button: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("button", { ...props, type: "button" }, children),
	Modal: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? renderChildren(children) : null),
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalPopup: ({ children }: { children: ReactNode }) => createElement("section", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
	Select: ({ options, value }: { options: Array<{ label: string; value: string }>; value: string }) =>
		createElement(
			"select",
			{ "aria-label": "select", value, onChange: () => {} },
			options.map((option) => createElement("option", { key: option.value, value: option.value }, option.label)),
		),
	TextInput: ({ mobileSafe: _mobileSafe, ...props }: Record<string, unknown>) => createElement("input", props),
}));

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: ({
		label,
		labelValue,
		onChange,
		onLabelValueClick,
		value,
	}: {
		label: string;
		labelValue: ReactNode;
		onChange: (event: { target: { value: string } }) => void;
		onLabelValueClick: () => void;
		value: string;
	}) =>
		createElement(
			"div",
			null,
			createElement("span", null, label),
			createElement(
				"button",
				{ "data-testid": "available-balance", onClick: onLabelValueClick, type: "button" },
				labelValue,
			),
			createElement("input", {
				"aria-label": label,
				onChange,
				value,
			}),
		),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: (value: unknown) =>
		value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin",
	isTokenSpotBalance: (balance: object) => "token" in balance,
	useDefaultDexBalances: () => testState.balances,
}));

vi.mock("@/hooks/trade/use-account-abstraction-guard", () => ({
	AccountAbstractionExecutionError: class AccountAbstractionExecutionError extends Error {
		constructor(readonly reason: "changed" | "unavailable") {
			super(reason);
		}
	},
	useAccountAbstractionPreExecutionGuard: () => testState.assertAccountAbstraction,
}));

vi.mock("@/hooks/trade/use-funds-action-availability", () => ({
	FundsActionGeoExecutionError: class FundsActionGeoExecutionError extends Error {
		constructor(readonly reason: "restricted" | "unavailable") {
			super(reason);
		}
	},
	useFundsActionAvailability: ({ accountModeReady }: { accountModeReady: boolean }) => {
		const unavailableReason = accountModeReady ? null : "Select a supported account mode before moving funds.";
		return {
			assertFreshGeoAllowed: testState.assertFreshGeoAllowed,
			internalTransfer: {
				available: accountModeReady,
				reason: accountModeReady ? null : "account-mode-unavailable",
				unavailableReason,
			},
			withdrawal: { available: true, reason: null, unavailableReason: null },
		};
	},
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: "0x1111111111111111111111111111111111111111",
		hasWalletAccess: true,
		walletAddress: "0x1111111111111111111111111111111111111111",
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: (
		method: keyof typeof testState.exchangeMutations,
		options?: { preExecutionGuard?: (_params: unknown, signal: AbortSignal) => Promise<void> },
	) => {
		if (options?.preExecutionGuard) testState.exchangeGuards.set(method, options.preExecutionGuard);
		return {
			isPending: false,
			mutateAsync: (params: unknown) => {
				if (!testState.runGuardsOnMutation) return testState.exchangeMutations[method](params);
				return (async () => {
					await options?.preExecutionGuard?.(params, new AbortController().signal);
					return testState.exchangeMutations[method](params);
				})();
			},
		};
	},
}));

vi.mock("@/lib/hyperliquid/markets/use-spot-tokens", () => ({
	useSpotTokens: () => ({
		getToken: (coin: string) => ({ name: coin, tokenId: 0, transferDecimals: 6 }),
	}),
}));

function getAmountInput(container: HTMLElement): HTMLInputElement {
	const input = container.querySelector('input[aria-label="Amount"]');
	if (!(input instanceof HTMLInputElement)) throw new Error("Amount input not found");
	return input;
}

function clickAvailableBalance(container: HTMLElement) {
	const button = container.querySelector<HTMLButtonElement>('[data-testid="available-balance"]');
	if (!button) throw new Error("Available balance button not found");
	act(() => button.click());
}

function setInputValue(input: HTMLInputElement, value: string) {
	const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	if (!valueSetter) throw new Error("Native input value setter not found");
	valueSetter.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === label);
	if (!(button instanceof HTMLButtonElement)) throw new Error(`${label} button not found`);
	return button;
}

describe("funds action balance wiring", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		testState.balances.accountAbstraction = "disabled";
		testState.balances.withdrawable = "40";
		testState.balances.spotBalances[0].hold = "3140.833333";
		testState.balances.spotBalances[0].total = "8105.34686269";
		testState.balances.spotStateReceivedAt = Date.now();
		testState.balances.perpStateReceivedAt = Date.now();
		testState.balances.spotStateStatus = "success";
		testState.balances.perpStateStatus = "success";
		testState.balances.isDataStale = false;
		testState.balances.hasError = false;
		testState.exchangeGuards.clear();
		testState.runGuardsOnMutation = false;
		testState.assertAccountAbstraction.mockReset();
		testState.assertAccountAbstraction.mockResolvedValue(undefined);
		testState.assertFreshGeoAllowed.mockReset();
		testState.assertFreshGeoAllowed.mockResolvedValue(undefined);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("uses clearinghouseState.withdrawable for Perp to Spot transfers", () => {
		act(() => root.render(createElement(TransferModal, { onOpenChange: vi.fn(), open: true })));

		expect(container.textContent).toContain("40.00 USDC");
		expect(container.textContent).not.toContain("56.00 USDC");
		clickAvailableBalance(container);
		expect(getAmountInput(container).value).toBe("40.00");
	});

	it("uses settled Spot total minus hold for Spot to Perp transfers", () => {
		act(() =>
			root.render(createElement(TransferModal, { initialDirection: "toPerp", onOpenChange: vi.fn(), open: true })),
		);

		expect(container.textContent).toContain("4964.51 USDC");
		expect(container.textContent).not.toContain("4947.18 USDC");
		clickAvailableBalance(container);
		expect(getAmountInput(container).value).toBe("4964.51");
	});

	it("uses clearinghouseState.withdrawable for sends from the Perps account", () => {
		act(() => root.render(createElement(SendModal, { initialAccountType: "perp", onOpenChange: vi.fn(), open: true })));

		expect(container.textContent).toContain("40.00 USDC");
		expect(container.textContent).not.toContain("56.00 USDC");
		clickAvailableBalance(container);
		expect(getAmountInput(container).value).toBe("40.00");
	});

	it("uses settled Spot total minus hold for spot sends", () => {
		act(() => root.render(createElement(SendModal, { onOpenChange: vi.fn(), open: true })));

		expect(container.textContent).toContain("4964.51 USDC");
		expect(container.textContent).not.toContain("4947.18 USDC");
		clickAvailableBalance(container);
		expect(getAmountInput(container).value).toBe("4964.51");
	});

	it("uses the unified trading account and the generalized spot-to-spot send action", async () => {
		testState.balances.accountAbstraction = "unifiedAccount";
		testState.exchangeMutations.sendAsset.mockResolvedValueOnce({ status: "ok" });

		act(() => root.render(createElement(SendModal, { initialAccountType: "perp", onOpenChange: vi.fn(), open: true })));

		expect(container.textContent).toContain("Trading Account");
		expect(container.textContent).not.toContain("Perps Account");

		const destinationInput = container.querySelector<HTMLInputElement>('input[placeholder="Destination address"]');
		if (!destinationInput) throw new Error("Destination input not found");
		act(() => {
			setInputValue(destinationInput, "0x2222222222222222222222222222222222222222");
			setInputValue(getAmountInput(container), "1");
		});

		await act(async () => getButton(container, "Send").click());

		expect(testState.exchangeMutations.sendAsset).toHaveBeenCalledWith({
			amount: "1",
			destination: "0x2222222222222222222222222222222222222222",
			destinationDex: "spot",
			sourceDex: "spot",
			token: "USDC:0",
		});
		expect(testState.exchangeMutations.spotSend).not.toHaveBeenCalled();
	});

	it("blocks mode-dependent fund actions until the account mode is supported", () => {
		testState.balances.accountAbstraction = "default";
		act(() => root.render(createElement(TransferModal, { onOpenChange: vi.fn(), open: true })));

		expect(container.textContent).toContain("Select a supported account mode before moving funds.");
		expect(container.textContent).not.toContain("40.00 USDC");
		expect(container.textContent).not.toContain("4964.51 USDC");
		expect(container.querySelector('input[aria-label="Amount"]')).toBeNull();
		expect(getButton(container, "Transfer").disabled).toBe(true);

		act(() => root.render(createElement(SendModal, { onOpenChange: vi.fn(), open: true })));
		expect(container.textContent).toContain("Select a supported account mode before moving funds.");
		expect(container.textContent).not.toContain("40.00 USDC");
		expect(container.textContent).not.toContain("4964.51 USDC");
		expect(getButton(container, "Send").disabled).toBe(true);
	});

	it("wires the fresh mode check into each mode-dependent SDK boundary", async () => {
		act(() => root.render(createElement(SendModal, { onOpenChange: vi.fn(), open: true })));
		const signal = new AbortController().signal;

		await testState.exchangeGuards.get("sendAsset")?.({ amount: "1", sourceDex: "spot", token: "USDC:0" }, signal);
		await testState.exchangeGuards.get("spotSend")?.({ amount: "1", token: "USDC:0" }, signal);
		expect(testState.assertAccountAbstraction).toHaveBeenCalledTimes(2);
		expect(testState.assertAccountAbstraction).toHaveBeenNthCalledWith(1, signal);
		expect(testState.assertAccountAbstraction).toHaveBeenNthCalledWith(2, signal);

		act(() => root.render(createElement(TransferModal, { onOpenChange: vi.fn(), open: true })));
		await testState.exchangeGuards.get("usdClassTransfer")?.({ amount: "1", toPerp: false }, signal);
		expect(testState.assertAccountAbstraction).toHaveBeenNthCalledWith(3, signal);
		expect(testState.assertFreshGeoAllowed).toHaveBeenCalledOnce();
		expect(testState.assertFreshGeoAllowed).toHaveBeenCalledWith(signal);
	});

	it("fails the internal-transfer SDK boundary closed when fresh geo cannot be verified", async () => {
		testState.assertFreshGeoAllowed.mockRejectedValueOnce(
			new Error("Unable to verify regional availability. This funds action was not submitted."),
		);
		act(() => root.render(createElement(TransferModal, { onOpenChange: vi.fn(), open: true })));

		const signal = new AbortController().signal;
		await expect(
			testState.exchangeGuards.get("usdClassTransfer")?.({ amount: "1", toPerp: false }, signal),
		).rejects.toThrow("Unable to verify regional availability");
		expect(testState.assertFreshGeoAllowed).toHaveBeenCalledWith(signal);
		expect(testState.exchangeMutations.usdClassTransfer).not.toHaveBeenCalled();
	});

	it("rechecks the exact balance after an async account preflight", async () => {
		let releasePreflight!: () => void;
		const preflight = new Promise<void>((resolve) => {
			releasePreflight = resolve;
		});
		testState.assertAccountAbstraction.mockReturnValueOnce(preflight);
		testState.runGuardsOnMutation = true;
		act(() => root.render(createElement(SendModal, { onOpenChange: vi.fn(), open: true })));
		const signal = new AbortController().signal;
		const guardPromise = testState.exchangeGuards.get("sendAsset")?.(
			{ amount: "1", sourceDex: "spot", token: "USDC:0" },
			signal,
		);
		await vi.waitFor(() => expect(testState.assertAccountAbstraction).toHaveBeenCalledOnce());

		testState.balances.spotBalances[0].hold = "8104.84686269";
		act(() => root.render(createElement(SendModal, { onOpenChange: vi.fn(), open: true })));
		releasePreflight();

		await expect(guardPromise).rejects.toThrow(BALANCE_CHANGED);
	});

	it.each([
		["send", () => renderValidSend(root, container), "spotSend"],
		["transfer", () => renderValidTransfer(root, container), "usdClassTransfer"],
	] as const)(
		"retranslates an existing %s balance-change guard after an en-to-ar switch",
		async (_, render, method) => {
			let releasePreflight!: () => void;
			const preflight = new Promise<void>((resolve) => {
				releasePreflight = resolve;
			});
			testState.assertAccountAbstraction.mockReturnValueOnce(preflight);
			testState.runGuardsOnMutation = true;
			render();

			act(() => getButton(container, method === "spotSend" ? "Send" : "Transfer").click());
			await vi.waitFor(() => expect(testState.assertAccountAbstraction).toHaveBeenCalledOnce());

			if (method === "spotSend") {
				testState.balances.spotBalances[0].total = "3141.333333";
			} else {
				testState.balances.withdrawable = "0.5";
			}
			act(() => {
				root.render(
					method === "spotSend"
						? createElement(SendModal, { onOpenChange: vi.fn(), open: true })
						: createElement(TransferModal, { onOpenChange: vi.fn(), open: true }),
				);
			});
			await act(async () => {
				releasePreflight();
				await preflight;
				await Promise.resolve();
				await Promise.resolve();
			});

			await vi.waitFor(() => expect(container.textContent).toContain(BALANCE_CHANGED));
			act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
			expect(container.textContent).toContain(BALANCE_CHANGED_AR);
			expect(container.textContent).not.toContain(BALANCE_CHANGED);
		},
	);

	it("retranslates a stable send account-mode guard code instead of retaining its old Error.message", async () => {
		testState.assertAccountAbstraction.mockRejectedValueOnce(new AccountAbstractionExecutionError("changed"));
		testState.runGuardsOnMutation = true;
		renderValidSend(root, container);

		await clickAndFlush(getButton(container, "Send"));
		await vi.waitFor(() => expect(container.textContent).toContain(ACCOUNT_MODE_CHANGED));

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.textContent).toContain(ACCOUNT_MODE_CHANGED_AR);
		expect(container.textContent).not.toContain(ACCOUNT_MODE_CHANGED);
	});

	it("retranslates a stable transfer geo-guard code instead of retaining its old Error.message", async () => {
		testState.assertFreshGeoAllowed.mockRejectedValueOnce(new FundsActionGeoExecutionError("unavailable"));
		testState.runGuardsOnMutation = true;
		renderValidTransfer(root, container);

		await clickAndFlush(getButton(container, "Transfer"));
		await vi.waitFor(() => expect(container.textContent).toContain(GEO_UNAVAILABLE));

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.textContent).toContain(GEO_UNAVAILABLE_AR);
		expect(container.textContent).not.toContain(GEO_UNAVAILABLE);
	});

	it.each([
		["send", () => renderValidSend(root, container), "spotSend"],
		["transfer", () => renderValidTransfer(root, container), "usdClassTransfer"],
	] as const)("preserves a raw %s exchange error across a locale switch", async (_, render, method) => {
		testState.exchangeMutations[method].mockRejectedValueOnce(new Error(RAW_EXCHANGE_ERROR));
		testState.runGuardsOnMutation = true;
		render();

		await clickAndFlush(getButton(container, method === "spotSend" ? "Send" : "Transfer"));
		await vi.waitFor(() => expect(container.textContent).toContain(RAW_EXCHANGE_ERROR));

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.textContent).toContain(RAW_EXCHANGE_ERROR);
	});
});

function renderValidSend(root: Root, container: HTMLElement) {
	act(() => root.render(createElement(SendModal, { onOpenChange: vi.fn(), open: true })));
	const destinationInput = container.querySelector<HTMLInputElement>('input[placeholder="Destination address"]');
	if (!destinationInput) throw new Error("Destination input not found");
	act(() => {
		setInputValue(destinationInput, "0x2222222222222222222222222222222222222222");
		setInputValue(getAmountInput(container), "1");
	});
}

function renderValidTransfer(root: Root, container: HTMLElement) {
	act(() => root.render(createElement(TransferModal, { onOpenChange: vi.fn(), open: true })));
	act(() => setInputValue(getAmountInput(container), "1"));
}

async function clickAndFlush(button: HTMLButtonElement) {
	await act(async () => {
		button.click();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
	});
}
