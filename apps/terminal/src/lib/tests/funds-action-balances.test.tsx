// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { act, createElement, Fragment, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SendModal } from "@/components/trade/positions/send-modal";
import { TransferModal } from "@/components/trade/positions/transfer-modal";
import { AccountAbstractionExecutionError } from "@/hooks/trade/use-account-abstraction-guard";
import { FundsActionGeoExecutionError } from "@/hooks/trade/use-funds-action-availability";
import { clearSendDraft } from "@/stores/use-send-draft-store";
import { createI18nRoot } from "./harness/react";

const BALANCE_UNAVAILABLE = "Balance data is unavailable. Try again after the connection recovers.";
const BALANCE_UNAVAILABLE_AR = "بيانات الرصيد غير متاحة. حاول مرة أخرى بعد استعادة الاتصال.";
const BALANCE_CHANGED = "Balance changed before submission. Review the updated balance and try again.";
const BALANCE_CHANGED_AR = "تغيّر الرصيد قبل الإرسال. راجع الرصيد المحدّث وحاول مرة أخرى.";
const ACCOUNT_MODE_CHANGED = "Account mode changed before the request was submitted. Review balances and try again.";
const ACCOUNT_MODE_CHANGED_AR = "تغيّر وضع الحساب قبل إرسال الطلب. راجع الأرصدة وحاول مرة أخرى.";
const GEO_UNAVAILABLE = "Unable to verify regional availability. This funds action was not submitted.";
const GEO_UNAVAILABLE_AR = "تعذّر التحقق من التوفر في منطقتك. لم يتم إرسال عملية إدارة الأموال هذه.";
const INVALID_DESTINATION = "Enter a valid Ethereum address.";
const INVALID_DESTINATION_AR = "أدخل عنوان Ethereum صالحًا.";
const RAW_EXCHANGE_ERROR = "Exchange rejected the funds action with code TEST-RAW";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(BALANCE_UNAVAILABLE)]: BALANCE_UNAVAILABLE_AR,
	[getMessageId(BALANCE_CHANGED)]: BALANCE_CHANGED_AR,
	[getMessageId(ACCOUNT_MODE_CHANGED)]: ACCOUNT_MODE_CHANGED_AR,
	[getMessageId(GEO_UNAVAILABLE)]: GEO_UNAVAILABLE_AR,
	[getMessageId(INVALID_DESTINATION)]: INVALID_DESTINATION_AR,
};

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMocks }));

const testState = vi.hoisted(() => ({
	pendingMethods: new Set<string>(),
	exchangeIdentity: {
		clientKey: "0x1111111111111111111111111111111111111111",
		env: "Mainnet" as "Mainnet" | "Testnet",
		exchangeLifecycle: { active: true, id: Symbol("exchange-lifecycle") },
		sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
	},
	walletSession: {
		address: "0x1111111111111111111111111111111111111111" as string | undefined,
		hasWalletAccess: true,
		sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
		walletAddress: "0x1111111111111111111111111111111111111111" as string | undefined,
		walletIntent: "embedded" as "embedded" | "external",
	},
	balances: {
		accountAbstraction: "disabled" as string | null,
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
	beforeSdk: vi.fn(),
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
	Select: ({
		options,
		triggerAriaLabel,
		value,
	}: {
		options: Array<{ label: string; value: string }>;
		triggerAriaLabel?: string;
		value: string;
	}) =>
		createElement(
			"select",
			{ "aria-label": triggerAriaLabel, value, onChange: () => {} },
			options.map((option) => createElement("option", { key: option.value, value: option.value }, option.label)),
		),
	TextInput: ({ error, mobileSafe: _mobileSafe, ...props }: Record<string, unknown>) =>
		createElement(
			"div",
			null,
			createElement("input", { ...props, "aria-invalid": error ? "true" : undefined }),
			error ? createElement("span", { "data-testid": "field-error" }, error as ReactNode) : null,
		),
}));

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: ({
		disabled,
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
		disabled?: boolean;
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
				disabled,
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

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ isResolved: true, proxy: false, tradeRestricted: false, isError: false }),
}));

vi.mock(import("../../hooks/trade/use-funds-action-availability"), async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		useFundsActionAvailability: (input: Parameters<typeof actual.useFundsActionAvailability>[0]) => ({
			...actual.useFundsActionAvailability(input),
			assertFreshGeoAllowed: testState.assertFreshGeoAllowed,
		}),
	};
});

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => testState.walletSession,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => testState.exchangeIdentity,
	useExchange: (
		method: keyof typeof testState.exchangeMutations,
		options?: {
			executionGuard?: (_params: unknown) => void;
			preExecutionGuard?: (_params: unknown, signal: AbortSignal) => Promise<void>;
		},
	) => {
		if (options?.preExecutionGuard) testState.exchangeGuards.set(method, options.preExecutionGuard);
		return {
			isPending: testState.pendingMethods.has(method),
			mutateAsync: (params: unknown) => {
				if (!testState.runGuardsOnMutation) return testState.exchangeMutations[method](params);
				return (async () => {
					const requestParams = { ...(params as Record<string, unknown>) };
					options?.executionGuard?.(requestParams);
					await options?.preExecutionGuard?.(requestParams, new AbortController().signal);
					await testState.beforeSdk(method, requestParams);
					options?.executionGuard?.(requestParams);
					return testState.exchangeMutations[method](requestParams);
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
		testState.exchangeIdentity.clientKey = "0x1111111111111111111111111111111111111111";
		testState.exchangeIdentity.env = "Mainnet";
		testState.exchangeIdentity.exchangeLifecycle = { active: true, id: Symbol("exchange-lifecycle") };
		testState.exchangeIdentity.sessionMode = "wallet";
		testState.walletSession.address = "0x1111111111111111111111111111111111111111";
		testState.walletSession.hasWalletAccess = true;
		testState.walletSession.sessionMode = "wallet";
		testState.walletSession.walletAddress = "0x1111111111111111111111111111111111111111";
		testState.walletSession.walletIntent = "embedded";
		testState.pendingMethods.clear();
		clearSendDraft();
		testState.balances.accountAbstraction = "disabled";
		testState.balances.hasError = false;
		testState.balances.isDataStale = false;
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
		testState.beforeSdk.mockReset();
		testState.beforeSdk.mockResolvedValue(undefined);
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

	it.each(["toSpot", "toPerp"] as const)(
		"keeps Max, validation and SDK amounts exact for %s",
		async (initialDirection) => {
			testState.balances.withdrawable = "1000000000000000.999999";
			testState.balances.spotBalances[0].total = "1000000000000001.000001";
			testState.balances.spotBalances[0].hold = "0.000002";
			testState.runGuardsOnMutation = true;
			act(() => root.render(createElement(TransferModal, { initialDirection, onOpenChange: vi.fn(), open: true })));
			clickAvailableBalance(container);
			expect(getAmountInput(container).value).toBe("1000000000000000.99");
			await act(async () => getButton(container, "Transfer").click());
			expect(testState.exchangeMutations.usdClassTransfer).toHaveBeenCalledExactlyOnceWith({
				amount: "1000000000000000.99",
				toPerp: initialDirection === "toPerp",
			});
		},
	);

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
		expect(container.querySelector('select[aria-label="Account"]')).not.toBeNull();
		expect(container.querySelector('select[aria-label="Asset"]')).not.toBeNull();
		clickAvailableBalance(container);
		expect(getAmountInput(container).value).toBe("4964.51");
	});

	it("uses the unified trading account and the generalized spot-to-spot send action", async () => {
		testState.balances.accountAbstraction = "unifiedAccount";
		testState.runGuardsOnMutation = true;
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

	it.each(["stale", "error"])("blocks transfer controls quietly with a preserved draft during %s data", (status) => {
		const renderTransfer = () =>
			act(() => root.render(createElement(TransferModal, { onOpenChange: vi.fn(), open: true })));
		renderTransfer();
		act(() => setInputValue(getAmountInput(container), "1"));
		testState.balances.isDataStale = status === "stale";
		testState.balances.hasError = status === "error";
		renderTransfer();
		expect(getAmountInput(container).value).toBe("1");
		expect(getAmountInput(container).disabled).toBe(true);
		expect(container.querySelector<HTMLButtonElement>('button[aria-label="Flip transfer direction"]')?.disabled).toBe(
			true,
		);
		expect(container.textContent).not.toContain("Balance data is unavailable");
		expect(getButton(container, "Transfer").disabled).toBe(true);
		act(() => getButton(container, "Transfer").click());
		expect(testState.exchangeMutations.usdClassTransfer).not.toHaveBeenCalled();
	});

	it.each(["default", "dexAbstraction"])(
		"explains confirmed unsupported %s mode without enabling fund actions",
		(mode) => {
			testState.balances.accountAbstraction = mode;
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
		},
	);

	it.each([null, "unknown"])("keeps unresolved %s mode quiet while disabling transfer and send", (mode) => {
		testState.balances.accountAbstraction = mode;
		act(() => root.render(createElement(TransferModal, { onOpenChange: vi.fn(), open: true })));
		expect(container.textContent).not.toContain("Select a supported account mode before moving funds.");
		expect(getButton(container, "Transfer").disabled).toBe(true);
		act(() => getButton(container, "Transfer").click());
		expect(testState.exchangeMutations.usdClassTransfer).not.toHaveBeenCalled();
		act(() => root.render(createElement(SendModal, { onOpenChange: vi.fn(), open: true })));
		expect(container.textContent).not.toContain("Select a supported account mode before moving funds.");
		expect(getButton(container, "Send").disabled).toBe(true);
	});

	it("identifies an invalid destination with an associated field error", () => {
		act(() => root.render(createElement(SendModal, { onOpenChange: vi.fn(), open: true })));
		const destinationInput = container.querySelector<HTMLInputElement>('input[placeholder="Destination address"]');
		if (!destinationInput) throw new Error("Destination input not found");
		expect(destinationInput.dir).toBe("auto");
		expect(destinationInput.getAttribute("autocapitalize")).toBe("none");

		act(() => setInputValue(destinationInput, "not-an-address"));

		expect(destinationInput.getAttribute("aria-invalid")).toBe("true");
		expect(container.querySelector('[data-testid="field-error"]')?.textContent).toBe(INVALID_DESTINATION);

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.querySelector('[data-testid="field-error"]')?.textContent).toBe(INVALID_DESTINATION_AR);
	});

	it("updates mode restrictions without replacing the open transfer dialog or losing its draft", () => {
		const renderTransfer = () =>
			act(() => root.render(createElement(TransferModal, { onOpenChange: vi.fn(), open: true })));
		renderTransfer();
		act(() => setInputValue(getAmountInput(container), "1"));
		const title = container.querySelector("h2");
		for (const mode of [null, "unknown", "default", "dexAbstraction"]) {
			testState.balances.accountAbstraction = mode;
			renderTransfer();
			expect(container.querySelector("h2")).toBe(title);
			expect(getButton(container, "Transfer").disabled).toBe(true);
			expect(container.textContent?.includes("Select a supported account mode before moving funds.")).toBe(
				mode === "default" || mode === "dexAbstraction",
			);
		}
		testState.balances.accountAbstraction = "disabled";
		renderTransfer();
		expect(getAmountInput(container).value).toBe("1");
		expect(getButton(container, "Transfer").disabled).toBe(false);
		expect(container.querySelector("h2")).toBe(title);
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

	const guardedMethods = ["spotSend", "sendAsset", "usdClassTransfer"] as const;
	function renderGuardedModal(method: (typeof guardedMethods)[number], onOpenChange = vi.fn()) {
		if (method === "usdClassTransfer") renderValidTransfer(root, container, onOpenChange);
		else renderValidSend(root, container, onOpenChange, method === "sendAsset" ? "perp" : "spot");
	}
	function rerenderGuardedModal(method: (typeof guardedMethods)[number], onOpenChange = vi.fn()) {
		const rerenderOnOpenChange = (open: boolean) => onOpenChange(open);
		act(() => {
			root.render(
				method === "usdClassTransfer"
					? createElement(TransferModal, { open: true, onOpenChange: rerenderOnOpenChange })
					: createElement(SendModal, {
							open: true,
							onOpenChange: rerenderOnOpenChange,
							initialAccountType: method === "sendAsset" ? "perp" : "spot",
						}),
			);
		});
	}
	function getGuardedSubmitButton(method: (typeof guardedMethods)[number]) {
		return getButton(container, method === "usdClassTransfer" ? "Transfer" : "Send");
	}

	it.each(guardedMethods)("blocks %s when the balance changes during the final legal check", async (method) => {
		let releaseLegal!: () => void;
		testState.beforeSdk.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				releaseLegal = resolve;
			}),
		);
		testState.runGuardsOnMutation = true;
		const onOpenChange = vi.fn();
		renderGuardedModal(method, onOpenChange);
		act(() => getGuardedSubmitButton(method).click());
		await vi.waitFor(() => expect(testState.beforeSdk).toHaveBeenCalledOnce());
		expect(testState.exchangeMutations[method]).not.toHaveBeenCalled();
		if (method === "spotSend") testState.balances.spotBalances[0].total = "3141.333333";
		else testState.balances.withdrawable = "0.5";
		rerenderGuardedModal(method, onOpenChange);
		expect(container.textContent).toContain("0.50 USDC");
		await act(async () => {
			releaseLegal();
		});
		expect(testState.exchangeMutations[method]).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(BALANCE_CHANGED));
		expect(container.textContent).not.toContain(BALANCE_CHANGED);
		expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
		if (method === "spotSend") testState.balances.spotBalances[0].total = "8105.34686269";
		else testState.balances.withdrawable = "40";
		rerenderGuardedModal(method, onOpenChange);
		await clickAndFlush(getGuardedSubmitButton(method));
		expect(testState.exchangeMutations[method]).toHaveBeenCalledOnce();
		expect(toastMocks.success).toHaveBeenCalledOnce();
		expect(onOpenChange).toHaveBeenCalledTimes(2);
	});

	it("reports a confirmed transfer through a notification and closes only after it settles", async () => {
		let settleMutation!: () => void;
		testState.exchangeMutations.usdClassTransfer.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					settleMutation = resolve;
				}),
		);
		const onOpenChange = vi.fn();
		renderValidTransfer(root, container, onOpenChange);

		act(() => getGuardedSubmitButton("usdClassTransfer").click());
		await vi.waitFor(() => expect(testState.exchangeMutations.usdClassTransfer).toHaveBeenCalledOnce());
		expect(onOpenChange).not.toHaveBeenCalled();
		expect(toastMocks.success).not.toHaveBeenCalled();

		await act(async () => settleMutation());
		await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false));
		expect(toastMocks.success).toHaveBeenCalledExactlyOnceWith("Transfer confirmed", expect.anything());
		const options = toastMocks.success.mock.calls[0]?.[1] as { description: ReactNode };
		const host = document.createElement("div");
		const descriptionRoot = createI18nRoot(host);
		act(() => descriptionRoot.render(createElement(Fragment, null, options.description)));
		expect(host.textContent).toContain("1 USDC");
		expect(host.querySelector('bdi[dir="ltr"]')?.textContent).toBe("1 USDC");
		act(() => descriptionRoot.unmount());
	});

	it("reports a confirmed send with the amount and token it sent", async () => {
		const onOpenChange = vi.fn();
		renderValidSend(root, container, onOpenChange);

		await clickAndFlush(getGuardedSubmitButton("spotSend"));

		await vi.waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Sent 1 USDC"));
		expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
	});

	it("restores the destination and amount of a failed send for the same account only", async () => {
		testState.exchangeMutations.spotSend.mockRejectedValueOnce(new Error(RAW_EXCHANGE_ERROR));
		renderValidSend(root, container);
		await clickAndFlush(getGuardedSubmitButton("spotSend"));
		await vi.waitFor(() => expect(toastMocks.error).toHaveBeenCalledOnce());

		act(() => root.render(createElement(SendModal, { onOpenChange: vi.fn(), open: false })));
		act(() => root.render(createElement(SendModal, { onOpenChange: vi.fn(), open: true })));
		const restored = container.querySelector<HTMLInputElement>('input[placeholder="Destination address"]');
		expect(restored?.value).toBe("0x2222222222222222222222222222222222222222");
		expect(getAmountInput(container).value).toBe("1");

		testState.exchangeIdentity.clientKey = "0x3333333333333333333333333333333333333333";
		act(() => root.render(createElement(SendModal, { onOpenChange: vi.fn(), open: false })));
		act(() => root.render(createElement(SendModal, { onOpenChange: vi.fn(), open: true })));
		const otherAccount = container.querySelector<HTMLInputElement>('input[placeholder="Destination address"]');
		expect(otherAccount?.value).toBe("");
		expect(getAmountInput(container).value).toBe("");
	});

	it("forgets the send draft once a send is confirmed", async () => {
		testState.exchangeMutations.spotSend.mockRejectedValueOnce(new Error(RAW_EXCHANGE_ERROR));
		renderValidSend(root, container);
		await clickAndFlush(getGuardedSubmitButton("spotSend"));
		await vi.waitFor(() => expect(toastMocks.error).toHaveBeenCalledOnce());

		await clickAndFlush(getGuardedSubmitButton("spotSend"));
		await vi.waitFor(() => expect(toastMocks.success).toHaveBeenCalledOnce());

		act(() => root.render(createElement(SendModal, { onOpenChange: vi.fn(), open: false })));
		act(() => root.render(createElement(SendModal, { onOpenChange: vi.fn(), open: true })));
		const destination = container.querySelector<HTMLInputElement>('input[placeholder="Destination address"]');
		expect(destination?.value).toBe("");
	});

	it.each([
		["external", "Confirm in wallet"],
		["embedded", "Transfer"],
	] as const)("names the pending transfer control for an %s wallet", (walletIntent, label) => {
		testState.walletSession.walletIntent = walletIntent;
		testState.pendingMethods.add("usdClassTransfer");
		renderValidTransfer(root, container);

		const control = [...container.querySelectorAll<HTMLButtonElement>("button")].at(-1);
		expect(control?.textContent?.trim()).toBe(label);
		expect(control?.disabled).toBe(true);
		expect(container.textContent).not.toContain("Transferring");
		expect(container.querySelector(".animate-spin")).toBeNull();
	});

	it.each([
		["external", "Confirm in wallet"],
		["embedded", "Send"],
	] as const)("names the pending send control for an %s wallet", (walletIntent, label) => {
		testState.walletSession.walletIntent = walletIntent;
		testState.pendingMethods.add("spotSend");
		renderValidSend(root, container);

		const control = [...container.querySelectorAll<HTMLButtonElement>("button")].at(-1);
		expect(control?.textContent?.trim()).toBe(label);
		expect(control?.disabled).toBe(true);
		expect(container.textContent).not.toContain("Sending");
	});

	it.each(guardedMethods)("blocks %s if its surface unmounts during the final legal check", async (method) => {
		let releaseLegal!: () => void;
		testState.beforeSdk.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				releaseLegal = resolve;
			}),
		);
		testState.runGuardsOnMutation = true;
		const onOpenChange = vi.fn();
		renderGuardedModal(method, onOpenChange);
		act(() => getGuardedSubmitButton(method).click());
		await vi.waitFor(() => expect(testState.beforeSdk).toHaveBeenCalledOnce());
		act(() => root.render(null));
		await act(async () => {
			releaseLegal();
		});
		expect(testState.exchangeMutations[method]).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it.each(guardedMethods)(
		"keeps an old %s request from adopting an identical replacement after the legal check",
		async (method) => {
			let releaseOldLegal!: () => void;
			let releaseCurrentLegal!: () => void;
			testState.beforeSdk
				.mockReturnValueOnce(
					new Promise<void>((resolve) => {
						releaseOldLegal = resolve;
					}),
				)
				.mockReturnValueOnce(
					new Promise<void>((resolve) => {
						releaseCurrentLegal = resolve;
					}),
				);
			testState.runGuardsOnMutation = true;
			const oldOnOpenChange = vi.fn();
			const currentOnOpenChange = vi.fn();
			renderGuardedModal(method, oldOnOpenChange);
			act(() => getGuardedSubmitButton(method).click());
			await vi.waitFor(() => expect(testState.beforeSdk).toHaveBeenCalledTimes(1));
			testState.exchangeIdentity.exchangeLifecycle = { active: true, id: Symbol("replacement") };
			rerenderGuardedModal(method, currentOnOpenChange);
			act(() => getGuardedSubmitButton(method).click());
			await vi.waitFor(() => expect(testState.beforeSdk).toHaveBeenCalledTimes(2));
			expect(testState.beforeSdk.mock.calls[0]?.[1]).toEqual(testState.beforeSdk.mock.calls[1]?.[1]);
			expect(testState.beforeSdk.mock.calls[0]?.[1]).not.toBe(testState.beforeSdk.mock.calls[1]?.[1]);
			await act(async () => {
				releaseOldLegal();
			});
			expect(testState.exchangeMutations[method]).not.toHaveBeenCalled();
			expect(oldOnOpenChange).not.toHaveBeenCalled();
			expect(currentOnOpenChange).not.toHaveBeenCalled();
			await act(async () => {
				releaseCurrentLegal();
			});
			expect(testState.exchangeMutations[method]).toHaveBeenCalledOnce();
			expect(currentOnOpenChange).toHaveBeenCalledExactlyOnceWith(false);
		},
	);

	it.each(guardedMethods)("submits %s once after all guards pass", async (method) => {
		testState.runGuardsOnMutation = true;
		const onOpenChange = vi.fn();
		renderGuardedModal(method, onOpenChange);
		await clickAndFlush(getGuardedSubmitButton(method));
		expect(testState.exchangeMutations[method]).toHaveBeenCalledOnce();
		expect(testState.assertAccountAbstraction).toHaveBeenCalledOnce();
		expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
	});

	it("rechecks and submits the Spot to Perp transfer using its original direction", async () => {
		testState.runGuardsOnMutation = true;
		const onOpenChange = vi.fn();
		act(() => root.render(createElement(TransferModal, { initialDirection: "toPerp", open: true, onOpenChange })));
		act(() => setInputValue(getAmountInput(container), "1"));
		await clickAndFlush(getButton(container, "Transfer"));
		expect(testState.exchangeMutations.usdClassTransfer).toHaveBeenCalledExactlyOnceWith({ amount: "1", toPerp: true });
		expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
	});

	it.each(guardedMethods)("rejects modified %s request parameters after the final legal check", async (method) => {
		testState.runGuardsOnMutation = true;
		testState.beforeSdk.mockImplementationOnce((_method, params) => {
			params.amount = "2";
		});
		const onOpenChange = vi.fn();
		renderGuardedModal(method, onOpenChange);
		await clickAndFlush(getGuardedSubmitButton(method));
		expect(testState.exchangeMutations[method]).not.toHaveBeenCalled();
		expect(toastMocks.error).toHaveBeenCalledOnce();
		expect(toastMocks.success).not.toHaveBeenCalled();
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
	});

	it.each([
		["send", () => renderValidSend(root, container), "spotSend"],
		["transfer", () => renderValidTransfer(root, container), "usdClassTransfer"],
	] as const)(
		"reports a %s balance-change guard in the locale that is active when it fails",
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
			act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
			await act(async () => {
				releasePreflight();
				await preflight;
				await Promise.resolve();
				await Promise.resolve();
			});

			await vi.waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(BALANCE_CHANGED_AR));
			expect(toastMocks.error).not.toHaveBeenCalledWith(BALANCE_CHANGED);
		},
	);

	it("reports a send account-mode guard from its stable code instead of its Error.message", async () => {
		testState.assertAccountAbstraction.mockRejectedValueOnce(new AccountAbstractionExecutionError("changed"));
		testState.runGuardsOnMutation = true;
		renderValidSend(root, container);
		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		await clickAndFlush(getGuardedSubmitButton("spotSend"));

		await vi.waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(ACCOUNT_MODE_CHANGED_AR));
		expect(toastMocks.error).not.toHaveBeenCalledWith(ACCOUNT_MODE_CHANGED);
	});

	it("reports a transfer geo guard from its stable code instead of its Error.message", async () => {
		testState.assertFreshGeoAllowed.mockRejectedValueOnce(new FundsActionGeoExecutionError("unavailable"));
		testState.runGuardsOnMutation = true;
		renderValidTransfer(root, container);
		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		await clickAndFlush(getGuardedSubmitButton("usdClassTransfer"));

		await vi.waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(GEO_UNAVAILABLE_AR));
		expect(toastMocks.error).not.toHaveBeenCalledWith(GEO_UNAVAILABLE);
	});

	it.each([
		["send", () => renderValidSend(root, container), "spotSend"],
		["transfer", () => renderValidTransfer(root, container), "usdClassTransfer"],
	] as const)("reports a raw %s exchange error unchanged in any locale", async (_, render, method) => {
		testState.exchangeMutations[method].mockRejectedValueOnce(new Error(RAW_EXCHANGE_ERROR));
		testState.runGuardsOnMutation = true;
		render();
		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		await clickAndFlush(getGuardedSubmitButton(method));

		await vi.waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(expect.stringContaining(RAW_EXCHANGE_ERROR)));
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});

	it.each([
		["send", "spotSend"],
		["transfer", "usdClassTransfer"],
	] as const)("ignores a stale %s completion after its modal surface is replaced", async (kind, method) => {
		let settleMutation!: () => void;
		const mutation = new Promise<void>((resolve) => {
			settleMutation = resolve;
		});
		testState.exchangeMutations[method].mockReturnValueOnce(mutation);
		const staleOnOpenChange = vi.fn();
		const currentOnOpenChange = vi.fn();

		if (kind === "send") {
			renderValidSend(root, container, staleOnOpenChange);
		} else {
			renderValidTransfer(root, container, staleOnOpenChange);
		}
		act(() => getButton(container, kind === "send" ? "Send" : "Transfer").click());
		await vi.waitFor(() => expect(testState.exchangeMutations[method]).toHaveBeenCalledOnce());

		act(() => {
			root.render(
				kind === "send"
					? createElement(SendModal, { onOpenChange: currentOnOpenChange, open: false })
					: createElement(TransferModal, { onOpenChange: currentOnOpenChange, open: false }),
			);
		});
		act(() => {
			root.render(
				kind === "send"
					? createElement(SendModal, { onOpenChange: currentOnOpenChange, open: true })
					: createElement(TransferModal, { onOpenChange: currentOnOpenChange, open: true }),
			);
		});

		await act(async () => {
			settleMutation();
			await mutation;
			await Promise.resolve();
		});

		expect(staleOnOpenChange).not.toHaveBeenCalled();
		expect(currentOnOpenChange).not.toHaveBeenCalled();
	});

	const identityChanges = [
		[
			"owner account",
			() => {
				testState.exchangeIdentity.clientKey = "0x3333333333333333333333333333333333333333";
				testState.walletSession.address = "0x3333333333333333333333333333333333333333";
				testState.walletSession.walletAddress = "0x3333333333333333333333333333333333333333";
			},
		],
		[
			"network",
			() => {
				testState.exchangeIdentity.env = "Testnet";
			},
		],
		[
			"signing session",
			() => {
				testState.exchangeIdentity.sessionMode = "agent-only";
				testState.walletSession.sessionMode = "agent-only";
			},
		],
		[
			"provider lifecycle",
			() => {
				testState.exchangeIdentity.exchangeLifecycle = {
					active: true,
					id: Symbol("replacement-exchange-lifecycle"),
				};
			},
		],
		[
			"account abstraction",
			() => {
				testState.balances.accountAbstraction = "unifiedAccount";
			},
		],
	] as const;

	it.each(
		identityChanges.flatMap(([identity, changeIdentity]) =>
			(["resolve", "reject"] as const).flatMap(
				(outcome) =>
					[
						["send", identity, outcome, changeIdentity, "spotSend"],
						["transfer", identity, outcome, changeIdentity, "usdClassTransfer"],
					] as const,
			),
		),
	)("ignores an in-flight %s after the %s changes (%s)", async (kind, _, outcome, changeIdentity, method) => {
		let resolveMutation!: () => void;
		let rejectMutation!: (reason: Error) => void;
		const mutation = new Promise<void>((resolve, reject) => {
			resolveMutation = resolve;
			rejectMutation = reject;
		});
		testState.exchangeMutations[method].mockReturnValueOnce(mutation);
		const staleOnOpenChange = vi.fn();
		const currentOnOpenChange = vi.fn();

		if (kind === "send") {
			renderValidSend(root, container, staleOnOpenChange);
		} else {
			renderValidTransfer(root, container, staleOnOpenChange);
		}
		act(() => getButton(container, kind === "send" ? "Send" : "Transfer").click());
		await vi.waitFor(() => expect(testState.exchangeMutations[method]).toHaveBeenCalledOnce());

		act(() => {
			changeIdentity();
			flushSync(() => {
				root.render(
					kind === "send"
						? createElement(SendModal, { onOpenChange: currentOnOpenChange, open: true })
						: createElement(TransferModal, { onOpenChange: currentOnOpenChange, open: true }),
				);
			});
		});

		await act(async () => {
			if (outcome === "resolve") resolveMutation();
			else rejectMutation(new Error("Stale request failed"));
			await mutation.catch(() => {});
			await Promise.resolve();
		});

		expect(staleOnOpenChange).not.toHaveBeenCalled();
		expect(currentOnOpenChange).not.toHaveBeenCalled();
		expect(getAmountInput(container).value).toBe("1");
		expect(container.textContent).not.toContain("Stale request failed");
		expect(container.querySelector('[role="alert"]')).toBeNull();
		if (kind === "send") {
			expect(container.querySelector<HTMLInputElement>('input[placeholder="Destination address"]')?.value).toBe(
				"0x2222222222222222222222222222222222222222",
			);
		}
	});
});

function renderValidSend(
	root: Root,
	container: HTMLElement,
	onOpenChange = vi.fn(),
	initialAccountType: "spot" | "perp" = "spot",
) {
	act(() => root.render(createElement(SendModal, { onOpenChange, open: true, initialAccountType })));
	const destinationInput = container.querySelector<HTMLInputElement>('input[placeholder="Destination address"]');
	if (!destinationInput) throw new Error("Destination input not found");
	act(() => {
		setInputValue(destinationInput, "0x2222222222222222222222222222222222222222");
		setInputValue(getAmountInput(container), "1");
	});
}

function renderValidTransfer(root: Root, container: HTMLElement, onOpenChange = vi.fn()) {
	act(() => root.render(createElement(TransferModal, { onOpenChange, open: true })));
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
