// @vitest-environment jsdom

import { act, createElement, useEffect } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderBatchResolutionError } from "@/domain/trade/order-tracking";
import { type OrderSubmitDraftResetToken, type OrderSubmitInput, useOrderSubmit } from "@/hooks/trade/use-order-submit";
import {
	useLimitPrice,
	useOrderEntryActions,
	useOrderSize,
	useReduceOnly,
	useSizeMode,
} from "@/stores/use-order-entry-store";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	exchangeSession: {
		id: Symbol("same-signing-session"),
		env: "Mainnet" as const,
		clientKey: "0x1111111111111111111111111111111111111111",
		sessionMode: "wallet" as const,
		active: true,
	},
	submitOrder: vi.fn(),
	submitTwap: vi.fn(),
	addOrder: vi.fn(() => "queue-1"),
	updateOrder: vi.fn(),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({
		clientKey: mocks.exchangeSession.clientKey,
		env: mocks.exchangeSession.env,
		exchangeSession: mocks.exchangeSession,
		sessionMode: mocks.exchangeSession.sessionMode,
	}),
}));

vi.mock("@/hooks/trade/use-tracked-order", () => ({
	useTrackedOrder: () => ({ submitOrder: mocks.submitOrder, isPending: false }),
}));

vi.mock("@/hooks/trade/use-tracked-twap-order", () => ({
	useTrackedTwapOrder: () => ({ submitTwap: mocks.submitTwap, isPending: false }),
}));

vi.mock("@/stores/use-order-queue-store", () => ({
	useOrderQueueActions: () => ({ addOrder: mocks.addOrder, updateOrder: mocks.updateOrder }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useOrderSubmit> | null = null;
let orderEntryActions: ReturnType<typeof useOrderEntryActions> | null = null;
let renderedLimitPrice = "";
let renderedReduceOnly = false;
let renderedSize = "";
let renderedSizeMode = "base";
const LIMIT_PREFILL_IDENTITY = "BTC|limit";

function Probe({ active = true, limitPricePrefill }: { active?: boolean; limitPricePrefill?: string }) {
	hookValue = useOrderSubmit();
	const actions = useOrderEntryActions();
	orderEntryActions = actions;
	const limitPrice = useLimitPrice();
	renderedLimitPrice = limitPrice;
	renderedReduceOnly = useReduceOnly();
	renderedSize = useOrderSize();
	renderedSizeMode = useSizeMode();
	useEffect(() => {
		if (!active || limitPricePrefill === undefined) return;
		actions.setLimitPriceFromPrefill(LIMIT_PREFILL_IDENTITY, limitPricePrefill);
	}, [actions, active, limitPricePrefill]);
	return null;
}

function marketInput(draftResetToken: OrderSubmitDraftResetToken): OrderSubmitInput {
	return {
		draftResetToken,
		market: { assetId: 0, kind: "perp", name: "BTC", szDecimals: 5 },
		baseToken: "BTC",
		side: "buy",
		orderType: "limit",
		sizeValue: 1,
		price: 100,
		executionReferencePx: 100,
		markPx: 100,
		marginMode: "cross",
		slippageBps: 50,
		reduceOnly: false,
		tif: "Gtc",
		limitPriceInput: "99",
		triggerPriceInput: "",
		scaleStartPriceInput: "",
		scaleEndPriceInput: "",
		scaleLevelsNum: null,
		scaleSkewInput: "",
		twapMinutesNum: null,
		twapRandomize: false,
		twapAdvancedEnabled: false,
		twapTriggerPx: null,
		twapStopPx: null,
		tpSlEnabled: false,
		canUseTpSl: false,
		tpPriceNum: null,
		slPriceNum: null,
		twapOrder: false,
		scaleOrder: false,
		triggerOrder: false,
	};
}

const CONFIRMED_ORDER = {
	state: "confirmed",
	result: { status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 1 } }] } } },
} as const;

describe("useOrderSubmit surface lifecycle with the real draft store", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.exchangeSession.active = true;
		mocks.submitOrder.mockReset();
		mocks.submitTwap.mockReset();
		mocks.addOrder.mockReset();
		mocks.addOrder.mockReturnValue("queue-1");
		mocks.updateOrder.mockReset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(createElement(Probe)));
		if (!orderEntryActions) throw new Error("Expected order-entry actions");
		act(() => {
			orderEntryActions?.resetFormForMarket("mainnet:perp:BTC");
			orderEntryActions?.resetForm();
			orderEntryActions?.setOrderType("limit");
			orderEntryActions?.setSizeMode("base");
			orderEntryActions?.setSize("1");
			orderEntryActions?.setLimitPriceFromUser(LIMIT_PREFILL_IDENTITY, "99");
		});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		hookValue = null;
		orderEntryActions = null;
		renderedSize = "";
		renderedLimitPrice = "";
		renderedReduceOnly = false;
	});

	function startDeferredSubmission() {
		let resolveSubmission: ((value: typeof CONFIRMED_ORDER) => void) | undefined;
		mocks.submitOrder.mockReturnValue(
			new Promise<typeof CONFIRMED_ORDER>((resolve) => {
				resolveSubmission = resolve;
			}),
		);
		const token = hookValue?.captureDraftResetToken();
		if (!hookValue || !token) throw new Error("Expected a current submission token");
		let submissionPromise: Promise<void> | undefined;
		act(() => {
			submissionPromise = hookValue?.handleSubmit(marketInput(token));
		});
		return { resolveSubmission, submissionPromise };
	}

	async function remountAndComplete({
		afterRemount,
		limitPricePrefill,
	}: {
		afterRemount?: () => void;
		limitPricePrefill?: string;
	} = {}) {
		const { resolveSubmission, submissionPromise } = startDeferredSubmission();
		act(() => root.render(null));
		act(() => root.render(createElement(Probe, { limitPricePrefill })));
		if (afterRemount) act(afterRemount);
		resolveSubmission?.(CONFIRMED_ORDER);
		await act(async () => {
			await submissionPromise;
		});
	}

	it("keeps the submitted limit on a replacement surface, then clears it without re-prefilling", async () => {
		await remountAndComplete({
			limitPricePrefill: "100",
			afterRemount: () => expect(renderedLimitPrice).toBe("99"),
		});

		expect(renderedSize).toBe("");
		expect(renderedLimitPrice).toBe("");
		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", expect.objectContaining({ status: "success" }));
	});

	it("preserves a newer draft entered on the replacement surface", async () => {
		await remountAndComplete({ afterRemount: () => orderEntryActions?.setSize("2") });

		expect(renderedSize).toBe("2");
	});

	it("preserves a converted quantity and unit entered on a replacement surface after a late receipt", async () => {
		await remountAndComplete({
			afterRemount: () => {
				orderEntryActions?.setSize("100");
				orderEntryActions?.setSizeMode("quote");
			},
		});

		expect(renderedSize).toBe("100");
		expect(renderedSizeMode).toBe("quote");
	});

	it("invalidates a frozen confirmation when only the quantity unit changes", () => {
		const token = hookValue?.captureDraftResetToken();
		if (!token) throw new Error("Missing original token");
		act(() => orderEntryActions?.setSizeMode("quote"));
		expect(hookValue?.isDraftResetTokenCurrent(token)).toBe(false);
	});

	it("clears quantity and reduce-only for the next market while retaining the chosen quantity unit", () => {
		act(() => {
			orderEntryActions?.setReduceOnly(true);
			orderEntryActions?.setSizeMode("quote");
		});
		const token = hookValue?.captureDraftResetToken();
		if (!token) throw new Error("Missing original token");
		act(() => orderEntryActions?.resetFormForMarket("mainnet:perp:ETH"));
		expect(renderedSize).toBe("");
		expect(renderedReduceOnly).toBe(false);
		expect(renderedSizeMode).toBe("quote");
		expect(hookValue?.isDraftResetTokenCurrent(token)).toBe(false);
	});

	it.each(["success", "partial", "reconciling", "twap-reconciling"])(
		"preserves later local edits while retaining the original %s feedback",
		async (outcome) => {
			let resolve: (value: unknown) => void = () => {};
			let reject: (error: unknown) => void = () => {};
			const deferred = new Promise((done, fail) => {
				resolve = done;
				reject = fail;
			});
			const isTwap = outcome === "twap-reconciling";
			(isTwap ? mocks.submitTwap : mocks.submitOrder).mockReturnValue(deferred);
			const token = hookValue?.captureDraftResetToken();
			if (!hookValue || !token) throw new Error("Missing submission token");
			const input = marketInput(token);
			if (isTwap) Object.assign(input, { orderType: "twap", twapOrder: true, twapMinutesNum: 30 });
			let pending: Promise<void> | undefined;
			act(() => {
				pending = hookValue?.handleSubmit(input);
			});
			act(() => orderEntryActions?.markDraftEdited());
			await act(async () => {
				if (outcome === "partial")
					reject(
						new OrderBatchResolutionError({
							status: "partial",
							acceptedCount: 1,
							rejectedCount: 1,
							totalCount: 2,
							errors: ["rejected child"],
						}),
					);
				else resolve(outcome.includes("reconciling") ? { state: "reconciling" } : CONFIRMED_ORDER);
				await pending;
			});
			expect(renderedSize).toBe("1");
			expect(renderedLimitPrice).toBe("99");
			expect(mocks.addOrder).toHaveBeenCalledWith(expect.objectContaining({ market: "BTC" }));
			if (outcome === "success" || outcome === "partial") {
				expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", expect.objectContaining({ status: outcome }));
			} else expect(mocks.updateOrder).not.toHaveBeenCalled();
		},
	);

	it("rejects a captured confirmation after an owner A-B-A cycle", async () => {
		const token = hookValue?.captureDraftResetToken();
		if (!token) throw new Error("Missing original token");
		const ownerA = mocks.exchangeSession.clientKey;
		for (const owner of ["0x2222222222222222222222222222222222222222", ownerA]) {
			mocks.exchangeSession.active = false;
			mocks.exchangeSession = { ...mocks.exchangeSession, id: Symbol(owner), clientKey: owner, active: true };
			act(() => root.render(createElement(Probe)));
		}
		expect(hookValue?.isDraftResetTokenCurrent(token)).toBe(false);
		await act(async () => hookValue?.handleSubmit(marketInput(token)));
		expect(mocks.submitOrder).not.toHaveBeenCalled();
		expect(mocks.addOrder).not.toHaveBeenCalled();
	});

	it("does not clear an unchanged draft when its old signing lease has expired", async () => {
		const { resolveSubmission, submissionPromise } = startDeferredSubmission();
		mocks.exchangeSession.active = false;
		mocks.exchangeSession = { ...mocks.exchangeSession, id: Symbol("replacement"), active: true };
		act(() => root.render(createElement(Probe)));
		await act(async () => {
			resolveSubmission?.(CONFIRMED_ORDER);
			await submissionPromise;
		});
		expect(renderedSize).toBe("1");
		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", expect.objectContaining({ status: "success" }));
	});

	it("preserves a newer limit price entered on the replacement surface", async () => {
		await remountAndComplete({
			afterRemount: () => orderEntryActions?.setLimitPriceFromUser(LIMIT_PREFILL_IDENTITY, "101"),
		});

		expect(renderedSize).toBe("1");
		expect(renderedLimitPrice).toBe("101");
	});

	it("preserves a newer reduce-only choice on the replacement surface", async () => {
		await remountAndComplete({ afterRemount: () => orderEntryActions?.setReduceOnly(true) });

		expect(renderedSize).toBe("1");
		expect(renderedReduceOnly).toBe(true);
	});

	it("does not re-prefill when completion clears the draft before a responsive remount", async () => {
		const { resolveSubmission, submissionPromise } = startDeferredSubmission();
		resolveSubmission?.(CONFIRMED_ORDER);
		await act(async () => {
			await submissionPromise;
		});
		expect(renderedLimitPrice).toBe("");

		act(() => root.render(null));
		act(() => root.render(createElement(Probe, { limitPricePrefill: "100" })));

		expect(renderedLimitPrice).toBe("");
	});

	it("preserves an explicitly cleared limit price across a responsive remount", () => {
		act(() => orderEntryActions?.setLimitPriceFromUser(LIMIT_PREFILL_IDENTITY, ""));
		act(() => root.render(null));
		act(() => root.render(createElement(Probe, { limitPricePrefill: "100" })));

		expect(renderedSize).toBe("1");
		expect(renderedLimitPrice).toBe("");
	});

	it("preserves an explicitly cleared limit price when the mobile surface becomes active again", () => {
		act(() => orderEntryActions?.setLimitPriceFromUser(LIMIT_PREFILL_IDENTITY, ""));
		act(() => root.render(createElement(Probe, { active: false, limitPricePrefill: "100" })));
		act(() => root.render(createElement(Probe, { active: true, limitPricePrefill: "100" })));

		expect(renderedSize).toBe("1");
		expect(renderedLimitPrice).toBe("");
	});
});
