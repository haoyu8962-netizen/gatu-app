// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EarnActionModal } from "@/components/earn/earn-action-modal";
import {
	buildEarnSnapshot,
	type EarnOperation,
	type EarnTokenMeta,
	parseEarnReserves,
	parseEarnUserState,
} from "@/domain/earn";
import type { EarnData } from "@/hooks/earn/use-earn-data";
import { createI18nRoot } from "./harness/react";

const OWNER = "0x1111111111111111111111111111111111111111";

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMocks }));

const testState = vi.hoisted(() => ({
	exchangeIdentity: {
		clientKey: "0x1111111111111111111111111111111111111111",
		env: "Mainnet" as "Mainnet" | "Testnet",
		exchangeLifecycle: { active: true, id: Symbol("exchange-lifecycle") },
		sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
	},
	borrowLend: vi.fn(),
	beforeSdk: vi.fn(),
	assertAccountAbstraction: vi.fn(),
	assertFreshGeoAllowed: vi.fn(),
	pending: false,
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? createElement("section", null, children) : null,
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
	Select: ({
		options,
		triggerAriaLabel,
		value,
	}: {
		options: Array<{ label: string; value?: string; options?: Array<{ label: string; value: string }> }>;
		triggerAriaLabel?: string;
		value: string | null;
	}) =>
		createElement(
			"select",
			{ "aria-label": triggerAriaLabel, value: value ?? "", onChange: () => {} },
			options
				.flatMap((option) => option.options ?? [{ label: option.label, value: option.value ?? "" }])
				.map((option) => createElement("option", { key: option.value, value: option.value }, option.label)),
		),
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({
		children,
		disabled,
		onClick,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick: () => void;
	}) => createElement("button", { type: "button", disabled, onClick, "data-testid": "submit" }, children),
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
			createElement("button", { "data-testid": "max", onClick: onLabelValueClick, type: "button" }, labelValue),
			createElement("input", { "aria-label": label, disabled, onChange, value }),
		),
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ hasWalletAccess: true, walletAddress: OWNER }),
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
	useFundsActionAvailability: () => ({
		assertFreshGeoAllowed: testState.assertFreshGeoAllowed,
		internalTransfer: { available: true, reason: null, unavailableReason: null },
		withdrawal: { available: true, reason: null, unavailableReason: null },
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => testState.exchangeIdentity,
	useExchange: (_method: string, options?: { executionGuard?: (params: unknown) => void }) => ({
		isPending: testState.pending,
		mutateAsync: async (params: unknown) => {
			const requestParams = { ...(params as Record<string, unknown>) };
			options?.executionGuard?.(requestParams);
			await testState.beforeSdk(requestParams);
			options?.executionGuard?.(requestParams);
			return testState.borrowLend(requestParams);
		},
	}),
}));

const RESERVES = [
	[
		0,
		{
			borrowYearlyRate: "0.05",
			supplyYearlyRate: "0.0285",
			utilization: "0.63",
			oraclePx: "1.0",
			ltv: "0.0",
			totalSupplied: "547176704.26",
			totalBorrowed: "347478659.20",
		},
	],
	[
		150,
		{
			borrowYearlyRate: "0.05",
			supplyYearlyRate: "0.0",
			utilization: "0.0",
			oraclePx: "92.76",
			ltv: "0.65",
			totalSupplied: "12011368.80",
			totalBorrowed: "0.0",
		},
	],
];

const TOKENS = new Map<number, EarnTokenMeta>([
	[0, { index: 0, name: "USDC", displayName: "USDC", weiDecimals: 8, szDecimals: 8 }],
	[150, { index: 150, name: "HYPE", displayName: "HYPE", weiDecimals: 8, szDecimals: 2 }],
]);

function userResponse(hypeSupplied: string) {
	return {
		tokenToState: [
			[0, { borrow: { basis: "1000", value: "1000" }, supply: { basis: "0", value: "0" } }],
			[150, { borrow: { basis: "0", value: "0" }, supply: { basis: hypeSupplied, value: hypeSupplied } }],
		],
		healthFactor: "6",
	};
}

function createData(hypeSupplied = "100", freshHypeSupplied = hypeSupplied): EarnData {
	const reserves = parseEarnReserves(RESERVES);
	const userState = parseEarnUserState(userResponse(hypeSupplied));
	const freshUser = parseEarnUserState(userResponse(freshHypeSupplied));
	if (!reserves || !userState || !freshUser) throw new Error("fixture must parse");
	const snapshotInputs = {
		tokens: TOKENS,
		portfolioMargin: false,
		spotBalances: new Map([
			[0, { token: 0, available: "700", total: "700" }],
			[150, { token: 150, available: "3.5", total: "3.5" }],
		]),
		availableAfterMaintenance: new Map<number, string>(),
	};
	return {
		ownerAddress: OWNER,
		isConnected: true,
		publicStatus: "ready",
		accountStatus: "ready",
		interestStatus: "ready",
		historyStatus: "ready",
		snapshot: buildEarnSnapshot({ reserves, userState, ...snapshotInputs }),
		snapshotInputs,
		accountAbstraction: "unifiedAccount",
		portfolioMargin: false,
		spotStateReceivedAt: Date.now(),
		interest: [],
		history: [],
		retryPublic: vi.fn(),
		retryAccount: vi.fn(),
		retryInterest: vi.fn(),
		retryHistory: vi.fn(),
		fetchFreshState: vi.fn(async () => ({ reserves, userState: freshUser })),
	};
}

function getInput(container: HTMLElement): HTMLInputElement {
	const input = container.querySelector("input");
	if (!(input instanceof HTMLInputElement)) throw new Error("Amount input not found");
	return input;
}

function getSubmit(container: HTMLElement): HTMLButtonElement {
	const button = container.querySelector<HTMLButtonElement>('[data-testid="submit"]');
	if (!button) throw new Error("Submit button not found");
	return button;
}

function setInputValue(input: HTMLInputElement, value: string) {
	const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	valueSetter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function flush() {
	await act(async () => {
		for (let index = 0; index < 5; index += 1) await Promise.resolve();
	});
}

describe("earn action modal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		testState.exchangeIdentity.exchangeLifecycle = { active: true, id: Symbol("exchange-lifecycle") };
		testState.pending = false;
		testState.borrowLend.mockReset();
		testState.borrowLend.mockResolvedValue({ status: "ok", response: { type: "default" } });
		testState.beforeSdk.mockReset();
		testState.beforeSdk.mockResolvedValue(undefined);
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

	function render(operation: EarnOperation, token: number | null, data: EarnData, onOpenChange = vi.fn()) {
		act(() =>
			root.render(createElement(EarnActionModal, { open: true, operation, initialToken: token, data, onOpenChange })),
		);
		return onOpenChange;
	}

	it("submits exactly the Max amount the dialog displayed", async () => {
		const onOpenChange = render("borrow", 0, createData());
		const maxButton = container.querySelector<HTMLButtonElement>('[data-testid="max"]');
		expect(maxButton?.textContent).toContain("5,029.4 USDC");
		act(() => maxButton?.click());
		expect(getInput(container).value).toBe("5029.4");

		act(() => getSubmit(container).click());
		await flush();

		expect(testState.borrowLend).toHaveBeenCalledTimes(1);
		expect(testState.borrowLend).toHaveBeenCalledWith({ operation: "borrow", token: 0, amount: "5029.4" });
		expect(toastMocks.success).toHaveBeenCalledWith("Borrowed USDC", expect.any(Object));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("never sends more than the fresh state allows at submission", async () => {
		const onOpenChange = render("withdraw", 150, createData("100", "80"));
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="max"]')?.click());
		const displayed = getInput(container).value;
		expect(displayed).toBe("83.41460178");

		act(() => getSubmit(container).click());
		await flush();

		expect(testState.borrowLend).not.toHaveBeenCalled();
		expect(toastMocks.error).toHaveBeenCalledWith(
			"Earn balances changed before submission. Review the updated amounts and try again.",
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("blocks amounts above the displayed maximum before submission", () => {
		render("supply", 0, createData());
		act(() => setInputValue(getInput(container), "701"));
		expect(container.textContent).toContain("Insufficient funds");
		expect(getSubmit(container).disabled).toBe(true);
		expect(getSubmit(container).textContent).toBe("Supply");
	});

	it("ignores a second click while the first request is in flight", async () => {
		let release: () => void = () => {};
		testState.beforeSdk.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				}),
		);
		render("supply", 0, createData());
		act(() => setInputValue(getInput(container), "10"));
		act(() => getSubmit(container).click());
		await flush();
		act(() => getSubmit(container).click());
		release();
		await flush();
		expect(testState.borrowLend).toHaveBeenCalledTimes(1);
		expect(testState.borrowLend).toHaveBeenCalledWith({ operation: "supply", token: 0, amount: "10" });
	});

	it("does not reach the SDK after the exchange identity ends", async () => {
		testState.beforeSdk.mockImplementation(async () => {
			testState.exchangeIdentity.exchangeLifecycle.active = false;
		});
		render("supply", 0, createData());
		act(() => setInputValue(getInput(container), "10"));
		act(() => getSubmit(container).click());
		await flush();
		expect(testState.borrowLend).not.toHaveBeenCalled();
		expect(toastMocks.success).not.toHaveBeenCalled();
	});

	it("reports an ambiguous transport outcome as unknown instead of failed", async () => {
		const error = Object.assign(new Error("network"), { name: "HttpRequestError", response: undefined });
		testState.borrowLend.mockRejectedValue(error);
		render("supply", 0, createData());
		act(() => setInputValue(getInput(container), "10"));
		act(() => getSubmit(container).click());
		await flush();
		expect(toastMocks.warning).toHaveBeenCalledWith("Earn request status unknown", expect.any(Object));
		expect(toastMocks.error).not.toHaveBeenCalled();
	});
});
