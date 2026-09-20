/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	assertEntryOrderExecutionAllowed,
	type EntryOrderExecutionState,
} from "@/domain/trade/order/entry-execution-guard";
import type { OrderConfirmationDraft } from "@/domain/trade/order-confirmation";
import { buildOrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { useOrderConfirmation } from "@/hooks/trade/use-order-confirmation";

const mocks = vi.hoisted(() => ({
	skipOrderConfirmation: false,
	calls: [] as string[],
	setSkipOrderConfirmation: vi.fn((next: boolean) => {
		mocks.calls.push(`setSkipOrderConfirmation:${next}`);
		mocks.skipOrderConfirmation = next;
	}),
	toastError: vi.fn(),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getSkipOrderConfirmation: () => mocks.skipOrderConfirmation,
	useGlobalSettingsActions: () => ({ setSkipOrderConfirmation: mocks.setSkipOrderConfirmation }),
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const DRAFT: OrderConfirmationDraft = {
	assetId: 0,
	marketLabel: "BTC-USD",
	marketKind: "perp",
	isLeveraged: true,
	side: "buy",
	orderType: "market",
	tif: "Gtc",
	baseToken: "BTC",
	szDecimals: 4,
	sizeValue: 0.5,
	orderValue: 50_000,
	limitPrice: null,
	triggerPrice: null,
	scaleStartPrice: null,
	scaleEndPrice: null,
	scaleLevels: null,
	scaleSkew: null,
	twapMinutes: null,
	twapRandomize: false,
	twapTriggerPrice: null,
	twapStopPrice: null,
	tpSlEnabled: false,
	tpPrice: null,
	slPrice: null,
	reduceOnly: false,
	leverage: 10,
	marginMode: "cross",
	marginRequired: 5_000,
	feeQuote: buildOrderFeeQuote({
		orderValue: 50_000,
		protocolRate: 0.00045,
		builderFeeTenthsBps: 10,
		marketKind: "perp",
		side: "buy",
		execution: "order",
	}),
	liqPrice: 90_000,
	liqWarning: false,
	slippagePercent: 2.5,
};

let hookValue: ReturnType<typeof useOrderConfirmation<string>> | null = null;
let execute: (input: string) => Promise<void>;
let canExecute: (input: string) => boolean;

function Probe() {
	hookValue = useOrderConfirmation<string>({ execute, canExecute });
	return null;
}

function currentHook(): ReturnType<typeof useOrderConfirmation<string>> {
	if (!hookValue) throw new Error("Expected order confirmation hook");
	return hookValue;
}

describe("order confirmation gate", () => {
	let container: HTMLDivElement;
	let root: Root;
	let executed: string[];

	beforeEach(() => {
		mocks.skipOrderConfirmation = false;
		mocks.calls = [];
		mocks.setSkipOrderConfirmation.mockClear();
		mocks.toastError.mockClear();
		executed = [];
		canExecute = () => true;
		execute = async (input: string) => {
			mocks.calls.push(`execute:${input}`);
			executed.push(input);
		};
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(<Probe />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		hookValue = null;
	});

	it("holds the order for confirmation while the preference is unset", async () => {
		await act(async () => {
			await currentHook().requestSubmit("order-1", DRAFT);
		});

		expect(executed).toEqual([]);
		expect(currentHook().pending).toEqual({ input: "order-1", draft: DRAFT });
	});

	it("checks the original input before opening and accepting confirmation", async () => {
		const check = vi.fn(() => true);
		canExecute = check;
		act(() => root.render(<Probe />));
		await act(async () => currentHook().requestSubmit("owner-a-draft", DRAFT));
		expect(check).toHaveBeenLastCalledWith("owner-a-draft");
		check.mockReturnValue(false);
		await act(async () => currentHook().confirm());
		expect(check).toHaveBeenLastCalledWith("owner-a-draft");
		expect(executed).toEqual([]);
	});

	it("does not bypass changed draft validation when confirmation is skipped", async () => {
		mocks.skipOrderConfirmation = true;
		canExecute = () => false;
		act(() => root.render(<Probe />));
		await act(async () => currentHook().requestSubmit("obsolete-draft", DRAFT));
		expect(executed).toEqual([]);
	});

	it("submits exactly once when the confirmation is accepted", async () => {
		await act(async () => {
			await currentHook().requestSubmit("order-1", DRAFT);
		});
		await act(async () => {
			await currentHook().confirm();
		});

		expect(executed).toEqual(["order-1"]);
		expect(currentHook().pending).toBeNull();
		expect(mocks.setSkipOrderConfirmation).not.toHaveBeenCalled();
	});

	it("persists the opt-out before the order is executed", async () => {
		await act(async () => {
			await currentHook().requestSubmit("order-1", DRAFT);
		});
		act(() => currentHook().setDontShowAgain(true));
		await act(async () => {
			await currentHook().confirm();
		});

		expect(mocks.calls).toEqual(["setSkipOrderConfirmation:true", "execute:order-1"]);
		expect(currentHook().dontShowAgain).toBe(false);
		expect(currentHook().pending).toBeNull();
	});

	it("submits directly and never opens the confirmation once the preference is stored", async () => {
		mocks.skipOrderConfirmation = true;

		await act(async () => {
			await currentHook().requestSubmit("order-1", DRAFT);
		});

		expect(executed).toEqual(["order-1"]);
		expect(currentHook().pending).toBeNull();
	});

	it("drops the order instead of submitting when a request-path gate flips during the review", async () => {
		await act(async () => {
			await currentHook().requestSubmit("order-1", DRAFT);
		});
		canExecute = () => false;
		act(() => currentHook().setDontShowAgain(true));
		await act(async () => {
			await currentHook().confirm();
		});

		expect(executed).toEqual([]);
		expect(currentHook().pending).toBeNull();
		expect(mocks.setSkipOrderConfirmation).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalledTimes(1);
	});

	it("closes the confirmation at the click and executes once in the background", async () => {
		let releaseExecute: (() => void) | null = null;
		execute = (input: string) =>
			new Promise<void>((resolve) => {
				executed.push(input);
				releaseExecute = resolve;
			});
		act(() => root.render(<Probe />));

		await act(async () => {
			await currentHook().requestSubmit("order-1", DRAFT);
		});

		let confirmed: Promise<void> | null = null;
		act(() => {
			confirmed = currentHook().confirm();
		});

		expect(currentHook().pending).toBeNull();
		expect(currentHook().isConfirming).toBe(true);
		expect(executed).toEqual(["order-1"]);

		await act(async () => {
			await currentHook().confirm();
			await currentHook().requestSubmit("order-2", DRAFT);
		});
		expect(executed).toEqual(["order-1"]);
		expect(currentHook().pending).toBeNull();

		await act(async () => {
			releaseExecute?.();
			await confirmed;
		});

		expect(executed).toEqual(["order-1"]);
		expect(currentHook().isConfirming).toBe(false);

		await act(async () => {
			await currentHook().requestSubmit("order-3", DRAFT);
		});
		expect(currentHook().pending?.input).toBe("order-3");
	});

	it("executes once when the confirm control is activated twice in the same tick", async () => {
		act(() => root.render(<Probe />));
		await act(async () => {
			await currentHook().requestSubmit("order-1", DRAFT);
		});
		await act(async () => {
			const hook = currentHook();
			await Promise.all([hook.confirm(), hook.confirm()]);
		});
		expect(executed).toEqual(["order-1"]);
	});

	it("reopens for the next order after a failed execution", async () => {
		execute = async () => {
			throw new Error("rejected");
		};
		act(() => root.render(<Probe />));
		await act(async () => {
			await currentHook().requestSubmit("order-1", DRAFT);
		});
		await act(async () => {
			await currentHook()
				.confirm()
				.catch(() => undefined);
		});
		expect(currentHook().isConfirming).toBe(false);
		await act(async () => {
			await currentHook().requestSubmit("order-2", DRAFT);
		});
		expect(currentHook().pending?.input).toBe("order-2");
	});
});

const SZ_DECIMALS = 3;
const SLIPPAGE_BPS = 250;

function guardState(referencePx: string): EntryOrderExecutionState {
	const now = Date.now();
	return {
		active: true,
		assetId: 0,
		szDecimals: SZ_DECIMALS,
		availabilityStatus: "success",
		availabilityReceivedAt: now,
		availabilityMaxAgeMs: 60_000,
		availability: { kind: "perp", maxBaseBySide: { buy: "10", sell: "10" } },
		positionStateReady: false,
		positionReceivedAt: undefined,
		positionSignedSize: undefined,
		markPriceStatus: "success",
		markPx: referencePx,
		markPriceReceivedAt: now,
		executionReferencePx: referencePx,
		executionPriceReceivedAt: now,
		slippageBps: SLIPPAGE_BPS,
	};
}

function planMarketBuy(referencePx: string) {
	return buildOrderPlan({
		kind: "entry",
		assetId: 0,
		side: "buy",
		orderType: "market",
		sizeValue: 0.5,
		szDecimals: SZ_DECIMALS,
		markPx: Number(referencePx),
		price: Number(referencePx),
		slippageBps: SLIPPAGE_BPS,
		reduceOnly: false,
		tif: "Gtc",
		limitPriceInput: "",
		triggerPriceInput: "",
		scaleStartPriceInput: "",
		scaleEndPriceInput: "",
		scaleLevelsNum: null,
		scaleSkewInput: "",
		tpSlEnabled: false,
		canUseTpSl: false,
		tpPriceNum: null,
		slPriceNum: null,
	});
}

describe("confirmed market orders replay against the live execution price", () => {
	let container: HTMLDivElement;
	let root: Root;
	let liveReferencePx: string;
	let submittedPrices: string[];

	function LivePriceProbe() {
		hookValue = useOrderConfirmation<string>({
			execute: async () => {
				const plan = planMarketBuy(liveReferencePx);
				assertEntryOrderExecutionAllowed({ orders: plan.orders, grouping: plan.grouping }, guardState(liveReferencePx));
				submittedPrices.push(String(plan.orders[0].p));
			},
			canExecute: () => true,
		});
		return null;
	}

	beforeEach(() => {
		mocks.skipOrderConfirmation = false;
		liveReferencePx = "60123.5";
		submittedPrices = [];
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(<LivePriceProbe />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		hookValue = null;
	});

	it("prices the order from the mid at confirm time, not the mid when the modal opened", async () => {
		await act(async () => {
			await currentHook().requestSubmit("order-1", DRAFT);
		});

		liveReferencePx = "60113.5";

		await act(async () => {
			await currentHook().confirm();
		});

		expect(submittedPrices).toEqual([String(planMarketBuy("60113.5").orders[0].p)]);
		expect(submittedPrices[0]).not.toBe(String(planMarketBuy("60123.5").orders[0].p));
	});

	it("documents that a price frozen when the modal opened is rejected by the execution guard", () => {
		const stalePlan = planMarketBuy("60123.5");

		expect(() =>
			assertEntryOrderExecutionAllowed(
				{ orders: stalePlan.orders, grouping: stalePlan.grouping },
				guardState("60113.5"),
			),
		).toThrow("Market price moved beyond the confirmed slippage limit");
	});
});
