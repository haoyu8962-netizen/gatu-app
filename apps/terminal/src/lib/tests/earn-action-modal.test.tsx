// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EarnActionModal } from "@/components/earn/earn-action-modal";
import {
	buildEarnSnapshot,
	type EarnOperation,
	type EarnSpotBalance,
	type EarnTokenMeta,
	parseEarnReserves,
	parseEarnUserState,
} from "@/domain/earn";
import type { EarnData, EarnFreshState } from "@/hooks/earn/use-earn-data";
import { createI18nRoot } from "./harness/react";

const OWNER = "0x1111111111111111111111111111111111111111";

const toastMocks = vi.hoisted(() => ({ dismiss: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMocks }));

const testState = vi.hoisted(() => ({
	exchangeIdentity: {
		clientKey: "0x1111111111111111111111111111111111111111",
		env: "Mainnet" as "Mainnet" | "Testnet",
		exchangeLifecycle: { active: true, id: Symbol("exchange-lifecycle") },
		sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
	},
	borrowLend: vi.fn(),
	beforeGuard: vi.fn(),
	beforeSdk: vi.fn(),
	assertAccountAbstraction: vi.fn(),
	assertFreshGeoAllowed: vi.fn(),
	guardController: null as AbortController | null,
	pending: false,
	availability: { available: true, reason: null as string | null, unavailableReason: null as string | null },
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({ children, open }: { children: ReactNode; open: boolean }) =>
		createElement("section", { "data-open": String(open) }, children),
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
	Select: ({
		options,
		triggerAriaLabel,
		value,
		onValueChange,
	}: {
		options: Array<{ label: string; value?: string; options?: Array<{ label: string; value: string }> }>;
		triggerAriaLabel?: string;
		value: string | null;
		onValueChange?: (value: string | null) => void;
	}) =>
		createElement(
			"select",
			{
				"aria-label": triggerAriaLabel,
				value: value ?? "",
				onChange: (event: { target: { value: string } }) => onValueChange?.(event.target.value),
			},
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
		"aria-describedby": describedBy,
		"aria-invalid": invalid,
	}: {
		"aria-describedby"?: string;
		"aria-invalid"?: boolean;
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
			createElement("input", {
				"aria-label": label,
				"aria-describedby": describedBy,
				"aria-invalid": invalid,
				disabled,
				onChange,
				value,
			}),
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
		internalTransfer: testState.availability,
		withdrawal: testState.availability,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => testState.exchangeIdentity,
	useExchange: (
		_method: string,
		options?: {
			executionGuard?: (params: unknown) => void;
			preExecutionGuard?: (params: unknown, signal: AbortSignal) => Promise<void>;
		},
	) => ({
		isPending: testState.pending,
		mutateAsync: async (params: unknown) => {
			const requestParams = { ...(params as Record<string, unknown>) };
			options?.executionGuard?.(requestParams);
			await testState.beforeGuard(requestParams);
			await options?.preExecutionGuard?.(requestParams, (testState.guardController ?? new AbortController()).signal);
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
			balance: "199698045.06",
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
			balance: "12011368.80",
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

function createUsdcData(
	options: { supplied?: string; borrowed?: string; spotUsdc?: string; reserveBalance?: string; basis?: string } = {},
): EarnData {
	const { supplied = "0", borrowed = "0", spotUsdc = "700", reserveBalance, basis = supplied } = options;
	const base = createData();
	const reserves = parseEarnReserves(
		RESERVES.map(([token, state]) =>
			token === 0 && reserveBalance ? [token, { ...(state as object), balance: reserveBalance }] : [token, state],
		),
	);
	const userState = parseEarnUserState({
		tokenToState: [
			[0, { borrow: { basis: borrowed, value: borrowed }, supply: { basis, value: supplied } }],
			[150, { borrow: { basis: "0", value: "0" }, supply: { basis: "100", value: "100" } }],
		],
		healthFactor: null,
	});
	if (!reserves || !userState) throw new Error("fixture must parse");
	const snapshotInputs = {
		...base.snapshotInputs,
		spotBalances: new Map([[0, { token: 0, available: spotUsdc, total: spotUsdc }]]),
	};
	return {
		...base,
		snapshot: buildEarnSnapshot({ reserves, userState, ...snapshotInputs }),
		snapshotInputs,
		fetchFreshState: vi.fn(async () => ({ reserves, userState })),
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

function toastText(node: unknown): string {
	const host = document.createElement("div");
	const toastRoot = createI18nRoot(host);
	act(() => toastRoot.render(node as ReactNode));
	const text = host.textContent ?? "";
	act(() => toastRoot.unmount());
	return text;
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
		testState.guardController = null;
		testState.availability = { available: true, reason: null, unavailableReason: null };
		testState.borrowLend.mockReset();
		testState.borrowLend.mockResolvedValue({ status: "ok", response: { type: "default" } });
		testState.beforeGuard.mockReset();
		testState.beforeGuard.mockResolvedValue(undefined);
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
			root.render(
				createElement(EarnActionModal, {
					open: true,
					sessionId: 1,
					operation,
					initialToken: token,
					data,
					onOpenChange,
				}),
			),
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
		expect(toastMocks.success).toHaveBeenCalledTimes(1);
		const [title, options] = toastMocks.success.mock.calls[0] as [unknown, { description?: unknown }];
		expect(toastText(title)).toBe("Borrowed \u20685,029.4 USDC\u2069");
		expect(options.description).toBeUndefined();
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
		expect(toastText(toastMocks.error.mock.calls[0]?.[0])).toBe(
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
		const [warningTitle, warningOptions] = toastMocks.warning.mock.calls[0] as [unknown, { duration: number }];
		expect(toastText(warningTitle)).toBe("Earn request status unknown");
		expect(warningOptions.duration).toBe(Number.POSITIVE_INFINITY);
		expect(toastMocks.error).not.toHaveBeenCalled();
	});
	it("rejects a second click in the same synchronous batch", async () => {
		render("supply", 0, createData());
		act(() => setInputValue(getInput(container), "10"));
		act(() => {
			getSubmit(container).click();
			getSubmit(container).click();
		});
		await flush();
		expect(testState.borrowLend).toHaveBeenCalledTimes(1);
	});

	it("fails closed at the SDK boundary when the balance shrinks while the request waits", async () => {
		const data = createData();
		testState.beforeSdk.mockImplementation(async () => {
			(data.snapshotInputs.spotBalances as Map<number, EarnSpotBalance>).set(0, {
				token: 0,
				available: "5",
				total: "5",
			});
		});
		render("supply", 0, data);
		act(() => setInputValue(getInput(container), "10"));
		act(() => getSubmit(container).click());
		await flush();
		expect(testState.borrowLend).not.toHaveBeenCalled();
		expect(toastText(toastMocks.error.mock.calls[0]?.[0])).toBe(
			"Earn balances changed before submission. Review the updated amounts and try again.",
		);
	});

	it("fails closed at the SDK boundary when the verification is too old", async () => {
		const realNow = Date.now.bind(Date);
		let offset = 0;
		const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => realNow() + offset);
		testState.beforeSdk.mockImplementation(async () => {
			offset = 21_000;
		});
		try {
			render("supply", 0, createData());
			act(() => setInputValue(getInput(container), "10"));
			act(() => getSubmit(container).click());
			await flush();
			expect(testState.borrowLend).not.toHaveBeenCalled();
		} finally {
			nowSpy.mockRestore();
		}
	});

	it("does not submit when the region or account mode cannot be verified", async () => {
		const { FundsActionGeoExecutionError } = await import("@/hooks/trade/use-funds-action-availability");
		testState.assertFreshGeoAllowed.mockRejectedValue(new FundsActionGeoExecutionError("restricted"));
		render("supply", 0, createData());
		act(() => setInputValue(getInput(container), "10"));
		act(() => getSubmit(container).click());
		await flush();
		expect(testState.borrowLend).not.toHaveBeenCalled();
		expect(toastText(toastMocks.error.mock.calls[0]?.[0])).toBe(
			"Funds actions are not available in your region. This funds action was not submitted.",
		);

		toastMocks.error.mockClear();
		testState.assertFreshGeoAllowed.mockResolvedValue(undefined);
		const { AccountAbstractionExecutionError } = await import("@/hooks/trade/use-account-abstraction-guard");
		testState.assertAccountAbstraction.mockRejectedValue(new AccountAbstractionExecutionError("changed"));
		render("supply", 0, createData());
		act(() => setInputValue(getInput(container), "10"));
		act(() => getSubmit(container).click());
		await flush();
		expect(testState.borrowLend).not.toHaveBeenCalled();
	});

	it("does not supply from a stale spot balance", async () => {
		const data = { ...createData(), spotStateReceivedAt: Date.now() - 60_000 };
		render("supply", 0, data);
		act(() => setInputValue(getInput(container), "10"));
		act(() => getSubmit(container).click());
		await flush();
		expect(testState.borrowLend).not.toHaveBeenCalled();
	});

	it("does not flag continuous interest accrual as a position change", () => {
		const accrued = (value: string) => {
			const data = createData();
			const reserves = parseEarnReserves(RESERVES);
			const userState = parseEarnUserState({
				tokenToState: [
					[0, { borrow: { basis: "1000", value: "1000" }, supply: { basis: "0", value: "0" } }],
					[150, { borrow: { basis: "0", value: "0" }, supply: { basis: "100", value } }],
				],
				healthFactor: "6",
			});
			if (!reserves || !userState) throw new Error("fixture must parse");
			return { ...data, snapshot: buildEarnSnapshot({ reserves, userState, ...data.snapshotInputs }) };
		};
		render("withdraw", 150, accrued("100.00000001"));
		render("withdraw", 150, accrued("100.00000009"));
		expect(container.textContent).not.toContain("Your position changed");
	});

	it("tells the user when the position changes after the dialog opened without blocking submission", () => {
		render("withdraw", 150, createData("100"));
		expect(container.textContent).not.toContain("Your position changed");
		render("withdraw", 150, createData("90"));
		expect(container.textContent).toContain(
			"Your position changed since you opened this dialog. Review the amounts before confirming.",
		);
		act(() => setInputValue(getInput(container), "1"));
		expect(getSubmit(container).disabled).toBe(false);
	});

	it("withdraws an outcome notice once the account or network changes", async () => {
		render("supply", 0, createData());
		act(() => setInputValue(getInput(container), "10"));
		act(() => getSubmit(container).click());
		await flush();
		const title = toastMocks.success.mock.calls[0]?.[0];
		testState.exchangeIdentity.env = "Testnet";
		try {
			expect(toastText(title)).toBe("");
			expect(toastMocks.dismiss).toHaveBeenCalledTimes(1);
		} finally {
			testState.exchangeIdentity.env = "Mainnet";
		}
	});
	it("does not submit while public reserve data is failing, even with cached rows", () => {
		render("supply", 0, { ...createData(), publicStatus: "error" });
		act(() => setInputValue(getInput(container), "10"));
		expect(getSubmit(container).disabled).toBe(true);
		expect(container.textContent).not.toContain("Insufficient funds");
	});

	it("does not conclude insufficient funds while the account snapshot is not ready", () => {
		render("withdraw", 150, { ...createData(), accountStatus: "loading" });
		act(() => setInputValue(getInput(container), "5"));
		expect(container.textContent).not.toContain("Insufficient funds");
		expect(getSubmit(container).disabled).toBe(true);
	});

	it("shows only confirmed restrictions, never passive availability text", () => {
		testState.availability = {
			available: false,
			reason: "geo-unresolved",
			unavailableReason: "Checking regional availability. Funds actions are temporarily unavailable.",
		};
		render("supply", 0, createData());
		expect(container.textContent).not.toContain("Checking regional availability");
		testState.availability = {
			available: false,
			reason: "geo-restricted",
			unavailableReason: "Funds actions are not available in your region.",
		};
		render("supply", 0, createData());
		expect(container.textContent).toContain("Funds actions are not available in your region.");
	});

	it("keeps the same dialog instance while it closes and refuses to submit when closed", () => {
		const onOpenChange = vi.fn();
		const data = createData();
		const renderWith = (open: boolean) =>
			act(() =>
				root.render(
					createElement(EarnActionModal, {
						open,
						sessionId: 7,
						operation: "supply",
						initialToken: 0,
						data,
						onOpenChange,
					}),
				),
			);
		renderWith(true);
		act(() => setInputValue(getInput(container), "10"));
		renderWith(false);
		expect(container.querySelector("section")?.getAttribute("data-open")).toBe("false");
		expect(getSubmit(container).disabled).toBe(true);
		act(() => getSubmit(container).click());
		expect(testState.borrowLend).not.toHaveBeenCalled();
		renderWith(true);
		expect(getInput(container).value).toBe("10");
	});

	it("links the amount error to the input and announces position changes politely", () => {
		render("supply", 0, createData());
		act(() => setInputValue(getInput(container), "701"));
		const input = getInput(container);
		const errorId = input.getAttribute("aria-describedby");
		expect(errorId).toBeTruthy();
		expect(container.querySelector(`[id="${errorId}"]`)?.textContent).toBe("Insufficient funds");
		expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
	});
	it("withdraws the entire supply with a full-position request when Max is used", async () => {
		const onOpenChange = render("withdraw", 0, createUsdcData({ supplied: "29.9410999" }));
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="max"]')?.click());
		expect(getInput(container).value).toBe("29.9410999");
		expect(container.textContent).toContain(
			"Withdraws your entire USDC supply at the moment it executes, including accrued interest.",
		);
		act(() => getSubmit(container).click());
		await flush();
		expect(testState.borrowLend).toHaveBeenCalledWith({ operation: "withdraw", token: 0, amount: null });
		const [title, options] = toastMocks.success.mock.calls[0] as [unknown, { description?: unknown }];
		expect(toastText(title)).toBe("Withdrew entire USDC supply");
		expect(options.description).toBeUndefined();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("goes back to an exact amount once the user edits the Max value", async () => {
		render("withdraw", 0, createUsdcData({ supplied: "29.9410999" }));
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="max"]')?.click());
		act(() => setInputValue(getInput(container), "10"));
		expect(container.textContent).not.toContain("Withdraws your entire");
		act(() => getSubmit(container).click());
		await flush();
		expect(testState.borrowLend).toHaveBeenCalledWith({ operation: "withdraw", token: 0, amount: "10" });
	});

	it("blocks a typed withdrawal that would leave less than $1 supplied", () => {
		render("withdraw", 0, createUsdcData({ supplied: "29.9410999" }));
		act(() => setInputValue(getInput(container), "29.5"));
		expect(container.textContent).toContain("Withdraw everything with Max, or leave at least $1 supplied.");
		expect(getSubmit(container).disabled).toBe(true);
		act(() => setInputValue(getInput(container), "29.9410999"));
		expect(getSubmit(container).disabled).toBe(true);
		act(() => setInputValue(getInput(container), "28"));
		expect(getSubmit(container).disabled).toBe(false);
	});

	it("blocks a supply that would leave the position below $1", () => {
		render("supply", 0, createUsdcData());
		act(() => setInputValue(getInput(container), "0.5"));
		expect(container.textContent).toContain("The minimum supply is $1.");
		expect(getSubmit(container).disabled).toBe(true);
	});

	it("repays the entire borrow with a full-position request only when the balance covers it", async () => {
		render("repay", 0, createUsdcData({ borrowed: "25", spotUsdc: "700" }));
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="max"]')?.click());
		act(() => getSubmit(container).click());
		await flush();
		expect(testState.borrowLend).toHaveBeenCalledWith({ operation: "repay", token: 0, amount: null });

		testState.borrowLend.mockClear();
		render("repay", 0, createUsdcData({ borrowed: "25", spotUsdc: "10" }));
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="max"]')?.click());
		act(() => getSubmit(container).click());
		await flush();
		expect(testState.borrowLend).toHaveBeenCalledWith({ operation: "repay", token: 0, amount: "10" });
	});

	it("explains the exchange's $1 minimum instead of showing only the raw error", async () => {
		const error = Object.assign(new Error("Borrow/Lend error: Minimum amount supplied is $1"), {
			name: "ApiRequestError",
		});
		testState.borrowLend.mockRejectedValue(error);
		render("withdraw", 0, createUsdcData({ supplied: "29.9410999" }));
		act(() => setInputValue(getInput(container), "20"));
		act(() => getSubmit(container).click());
		await flush();
		expect(toastText(toastMocks.error.mock.calls[0]?.[0])).toBe(
			"Hyperliquid requires at least $1 to stay supplied. Withdraw everything with Max, or leave at least $1.",
		);
	});
	it("keeps a limited Max exact even after the full position becomes available", async () => {
		render("withdraw", 0, createUsdcData({ supplied: "100", reserveBalance: "50" }));
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="max"]')?.click());
		expect(getInput(container).value).toBe("50");
		expect(container.textContent).not.toContain("Withdraws your entire");
		render("withdraw", 0, createUsdcData({ supplied: "100", reserveBalance: "10000" }));
		expect(getInput(container).value).toBe("50");
		expect(container.textContent).not.toContain("Withdraws your entire");
		act(() => getSubmit(container).click());
		await flush();
		expect(testState.borrowLend).toHaveBeenCalledWith({ operation: "withdraw", token: 0, amount: "50" });
	});

	it("drops a full-position request when the position changes", () => {
		render("withdraw", 0, createUsdcData({ supplied: "100" }));
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="max"]')?.click());
		expect(container.textContent).toContain("Withdraws your entire USDC supply");
		render("withdraw", 0, createUsdcData({ supplied: "50" }));
		expect(container.textContent).toContain("This position changed. Use Max again or enter an amount.");
		expect(container.textContent).not.toContain("Withdraws your entire USDC supply");
		expect(getSubmit(container).disabled).toBe(true);
		render("withdraw", 0, createUsdcData({ supplied: "100.00000001", basis: "100" }));
		expect(container.textContent).toContain("This position changed. Use Max again or enter an amount.");
		expect(getSubmit(container).disabled).toBe(true);
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="max"]')?.click());
		expect(container.textContent).not.toContain("This position changed");
		expect(container.textContent).toContain("Withdraws your entire USDC supply");
		expect(getSubmit(container).disabled).toBe(false);
	});

	it("clears the draft when the account changes", () => {
		const data = createUsdcData({ supplied: "10" });
		render("withdraw", 0, data);
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="max"]')?.click());
		expect(container.textContent).toContain("Withdraws your entire USDC supply");
		const previous = testState.exchangeIdentity.clientKey;
		testState.exchangeIdentity.clientKey = "0x2222222222222222222222222222222222222222";
		try {
			render("withdraw", 0, createUsdcData({ supplied: "1000" }));
			expect(getInput(container).value).toBe("");
			expect(container.textContent).not.toContain("Withdraws your entire");
			expect(getSubmit(container).disabled).toBe(true);
		} finally {
			testState.exchangeIdentity.clientKey = previous;
		}
	});

	it("clears a full-position request when the asset changes", () => {
		const data = createUsdcData({ supplied: "100" });
		render("withdraw", 0, data);
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="max"]')?.click());
		expect(container.textContent).toContain("Withdraws your entire USDC supply");
		const select = container.querySelector("select");
		if (!select) throw new Error("asset select missing");
		act(() => {
			select.value = "150";
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(getInput(container).value).toBe("");
		expect(container.textContent).not.toContain("Withdraws your entire");
	});

	it("does not send a full withdrawal whose principal changes before the SDK boundary", async () => {
		const data = createUsdcData({ supplied: "100" });
		testState.beforeSdk.mockImplementation(async () => {
			const reserves = parseEarnReserves(RESERVES);
			const topUp = parseEarnUserState({
				tokenToState: [[0, { borrow: { basis: "0", value: "0" }, supply: { basis: "600", value: "600" } }]],
				healthFactor: null,
			});
			if (!reserves || !topUp) throw new Error("fixture must parse");
			data.snapshot = buildEarnSnapshot({ reserves, userState: topUp, ...data.snapshotInputs });
		});
		render("withdraw", 0, data);
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="max"]')?.click());
		act(() => getSubmit(container).click());
		await flush();
		expect(testState.borrowLend).not.toHaveBeenCalled();
		expect(toastText(toastMocks.error.mock.calls[0]?.[0])).toBe(
			"Earn balances changed before submission. Review the updated amounts and try again.",
		);
	});

	it("rejects request parameters changed after the pre-send check", async () => {
		testState.beforeSdk.mockImplementation(async (params: Record<string, unknown>) => {
			params.amount = "999";
		});
		render("supply", 0, createData());
		act(() => setInputValue(getInput(container), "10"));
		act(() => getSubmit(container).click());
		await flush();
		expect(testState.borrowLend).not.toHaveBeenCalled();
	});
	it("re-reads the position inside the funds lock before sending a full withdrawal", async () => {
		const data = createUsdcData({ supplied: "100" });
		const reserves = parseEarnReserves(RESERVES);
		const initial = parseEarnUserState({
			tokenToState: [[0, { borrow: { basis: "0", value: "0" }, supply: { basis: "100", value: "100" } }]],
			healthFactor: null,
		});
		const afterOtherTab = parseEarnUserState({
			tokenToState: [[0, { borrow: { basis: "0", value: "0" }, supply: { basis: "600", value: "600" } }]],
			healthFactor: null,
		});
		if (!reserves || !initial || !afterOtherTab) throw new Error("fixture must parse");
		let otherTabFinished = false;
		data.fetchFreshState = vi.fn(async () => ({ reserves, userState: otherTabFinished ? afterOtherTab : initial }));
		testState.beforeGuard.mockImplementation(async () => {
			otherTabFinished = true;
		});
		render("withdraw", 0, data);
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="max"]')?.click());
		act(() => getSubmit(container).click());
		await flush();
		expect(data.fetchFreshState).toHaveBeenCalledTimes(1);
		expect(data.fetchFreshState).toHaveBeenCalledWith(expect.any(AbortSignal));
		expect(testState.borrowLend).not.toHaveBeenCalled();
		expect(toastText(toastMocks.error.mock.calls[0]?.[0])).toBe(
			"Earn balances changed before submission. Review the updated amounts and try again.",
		);
	});

	it("keeps the draft when the same account briefly loses its account mode", () => {
		render("supply", 0, createData());
		act(() => setInputValue(getInput(container), "20"));
		render("supply", 0, { ...createData(), accountAbstraction: "unknown", accountStatus: "loading" });
		expect(getInput(container).value).toBe("20");
		expect(getSubmit(container).disabled).toBe(true);
		render("supply", 0, createData());
		expect(getInput(container).value).toBe("20");
		expect(getSubmit(container).disabled).toBe(false);
	});

	it("stays silent when a full-position request cannot be verified for a moment", () => {
		render("withdraw", 0, createUsdcData({ supplied: "100" }));
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="max"]')?.click());
		render("withdraw", 0, { ...createUsdcData({ supplied: "100" }), publicStatus: "error" });
		expect(container.textContent).not.toContain("This position changed");
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(getSubmit(container).disabled).toBe(true);
		render("withdraw", 0, createUsdcData({ supplied: "100" }));
		expect(container.textContent).toContain("Withdraws your entire USDC supply");
		expect(getSubmit(container).disabled).toBe(false);
	});

	it("keeps a repay-all request void after the borrow closes, even when the same borrow returns", async () => {
		render("repay", 0, createUsdcData({ borrowed: "25", spotUsdc: "700" }));
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="max"]')?.click());
		expect(container.textContent).toContain("Repays your entire USDC borrow");
		render("repay", 0, createUsdcData({ borrowed: "0", spotUsdc: "700" }));
		expect(container.textContent).toContain(
			"Your position changed since you opened this dialog. Review the amounts before confirming.",
		);
		expect(getSubmit(container).disabled).toBe(true);
		render("repay", 0, createUsdcData({ borrowed: "25", spotUsdc: "700" }));
		expect(container.textContent).toContain("This position changed. Use Max again or enter an amount.");
		expect(container.textContent).not.toContain("Repays your entire USDC borrow");
		expect(getSubmit(container).disabled).toBe(true);
		act(() => getSubmit(container).click());
		await flush();
		expect(testState.borrowLend).not.toHaveBeenCalled();
	});

	it("does not show change notices while the dialog closes", () => {
		const renderWith = (open: boolean, data: EarnData) =>
			act(() =>
				root.render(
					createElement(EarnActionModal, {
						open,
						sessionId: 9,
						operation: "withdraw",
						initialToken: 0,
						data,
						onOpenChange: vi.fn(),
					}),
				),
			);
		renderWith(true, createUsdcData({ supplied: "100" }));
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="max"]')?.click());
		renderWith(false, createUsdcData({ supplied: "50" }));
		expect(container.querySelector("section")?.getAttribute("data-open")).toBe("false");
		expect(container.textContent).not.toContain("Your position changed");
		expect(container.textContent).not.toContain("This position changed");
	});

	it("passes the funds-lock signal to the fresh read and does not send once it aborts", async () => {
		const controller = new AbortController();
		testState.guardController = controller;
		const data = createUsdcData({ supplied: "100" });
		const freshState = await data.fetchFreshState(new AbortController().signal);
		let finishRead = () => {};
		data.fetchFreshState = vi.fn(
			() =>
				new Promise<EarnFreshState | null>((resolve) => {
					finishRead = () => resolve(freshState);
				}),
		);
		render("withdraw", 0, data);
		act(() => setInputValue(getInput(container), "10"));
		act(() => getSubmit(container).click());
		await flush();
		expect(data.fetchFreshState).toHaveBeenCalledWith(controller.signal);
		controller.abort(new Error("guard timed out"));
		finishRead();
		await flush();
		expect(testState.borrowLend).not.toHaveBeenCalled();
	});
});
