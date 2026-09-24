// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Big from "big.js";
import { act, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderConfirmationModal } from "@/components/trade/tradebox/order-confirmation-modal";
import {
	assertEntryOrderExecutionAllowed,
	assertEntryTwapExecutionAllowed,
	type EntryOrderExecutionState,
} from "@/domain/trade/order/entry-execution-guard";
import { getReduceOnlySizeSelection } from "@/domain/trade/order/size";
import type { OrderConfirmationDraft } from "@/domain/trade/order-confirmation";
import { buildOrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { useOrderConfirmation } from "@/hooks/trade/use-order-confirmation";
import { type OrderSubmitInput, useOrderSubmit } from "@/hooks/trade/use-order-submit";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { useOrderQueue } from "@/stores/use-order-queue-store";
import { getPendingOrderActions } from "@/stores/use-pending-order-store";
import { getPendingTwapActions } from "@/stores/use-pending-twap-store";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	owner: "0x1111111111111111111111111111111111111111",
	order: vi.fn(),
	twapOrder: vi.fn(),
	session: { id: Symbol("reduce-only-integration"), active: true },
}));
vi.mock("@gatu/hl-react/hooks/useClients", () => ({
	useHyperliquidClients: () => ({
		trading: { order: mocks.order, twapOrder: mocks.twapOrder },
		user: {},
		info: {},
		subscription: {},
		userWalletMismatch: false,
	}),
}));
vi.mock("../../../../../packages/hl-react/src/signing/owner-signer-provider", () => ({
	useHyperliquidOwnerSigner: () => ({ assertCurrent: () => {} }),
}));
vi.mock("@gatu/hl-react/provider", () => ({
	useHyperliquid: () => ({
		clientKey: mocks.owner,
		env: "Mainnet",
		sessionMode: "wallet",
		exchangeSession: mocks.session,
		exchangeLifecycle: mocks.session,
		enforceLegalActions: false,
		builderConfig: { b: "0x0000000000000000000000000000000000000000", f: 0 },
		info: {},
	}),
}));
vi.mock("@/lib/hyperliquid", async () => ({
	useExchange: (await import("@gatu/hl-react/hooks/useExchange")).useExchange,
	useHyperliquid: (await import("@gatu/hl-react/provider")).useHyperliquid,
	useSubscription: (method: string) => ({
		status: "active",
		isStale: false,
		data: method === "twapStates" ? { states: [] } : { history: [] },
	}),
}));
vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({
		children,
		onClick,
		disabled,
	}: {
		children: ReactNode;
		onClick: () => void;
		disabled?: boolean;
	}) => (
		<button type="button" data-testid="commit-order" onClick={onClick} disabled={disabled}>
			{children}
		</button>
	),
}));

let queue: ReturnType<typeof useOrderQueue>;
let state: EntryOrderExecutionState;
let hookValue: ReturnType<typeof useOrderSubmit>;
let confirmation: ReturnType<typeof useOrderConfirmation<OrderSubmitInput>>;
let actions: ReturnType<typeof useOrderEntryActions>;
function Probe() {
	queue = useOrderQueue();
	actions = useOrderEntryActions();
	hookValue = useOrderSubmit({
		executionGuard: (params) => assertEntryOrderExecutionAllowed(params, state),
		twapExecutionGuard: (params) => assertEntryTwapExecutionAllowed(params, state),
	});
	confirmation = useOrderConfirmation({
		execute: hookValue.handleSubmit,
		canExecute: (input) => hookValue.isDraftResetTokenCurrent(input.draftResetToken),
	});
	const pending = confirmation.pending;
	return pending ? (
		<OrderConfirmationModal
			open
			draft={pending.draft}
			dontShowAgain={false}
			onDontShowAgainChange={() => {}}
			onOpenChange={() => confirmation.cancel()}
			onConfirm={() => void confirmation.confirm()}
		/>
	) : null;
}
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
function twapInput(overrides: Partial<OrderSubmitInput> = {}): OrderSubmitInput {
	const draftResetToken = hookValue?.captureDraftResetToken();
	if (!draftResetToken) throw new Error("Expected a current draft reset token");
	return {
		draftResetToken,
		market: { assetId: 0, kind: "perp", name: "BTC", szDecimals: 5 },
		baseToken: "BTC",
		side: "buy",
		orderType: "twap",
		sizeValue: 1,
		price: 100,
		executionReferencePx: 100.5,
		markPx: 100,
		marginMode: "cross",
		slippageBps: 50,
		reduceOnly: false,
		tif: "Gtc",
		limitPriceInput: "",
		triggerPriceInput: "",
		scaleStartPriceInput: "",
		scaleEndPriceInput: "",
		scaleLevelsNum: null,
		scaleSkewInput: "",
		twapMinutesNum: 30,
		twapRandomize: true,
		twapAdvancedEnabled: true,
		twapTriggerPx: null,
		twapStopPx: null,
		tpSlEnabled: false,
		canUseTpSl: false,
		tpPriceNum: null,
		slPriceNum: null,
		twapOrder: true,
		scaleOrder: false,
		triggerOrder: false,
		...overrides,
	};
}

describe("Reduce Only displayed commitment through real submit/tracking/exchange to SDK", () => {
	let root: Root;
	let container: HTMLDivElement;
	let query: QueryClient;
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
		localStorage.setItem(
			`hyperliquid_agent_registration_session_Mainnet_${mocks.owner}`,
			JSON.stringify({ version: 1, epoch: "reduce-only-test", state: "active" }),
		);
		Object.defineProperty(navigator, "locks", {
			configurable: true,
			value: {
				request: async (name: string, _options: LockOptions, callback: (lock: Lock) => unknown) =>
					callback({ name, mode: "exclusive" }),
			},
		});
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
		mocks.order.mockReset().mockImplementation(async (params) => ({
			status: "ok",
			response: { type: "order", data: { statuses: params.orders.map(() => ({ resting: { oid: 123 } })) } },
		}));
		mocks.twapOrder.mockReset().mockResolvedValue({
			status: "ok",
			response: { type: "twapOrder", data: { status: { running: { twapId: 123 } } } },
		});
		vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
		state = {
			active: true,
			assetId: 0,
			szDecimals: 3,
			availabilityStatus: "success",
			availabilityReceivedAt: Date.now(),
			availabilityMaxAgeMs: 20000,
			availability: { kind: "perp", maxBaseBySide: { buy: "0", sell: "0" } },
			positionStateReady: true,
			positionReceivedAt: Date.now(),
			positionSignedSize: "7.15",
			markPriceStatus: "success",
			markPx: "100",
			markPriceReceivedAt: Date.now(),
			executionReferencePx: "100",
			executionPriceReceivedAt: Date.now(),
			slippageBps: 250,
		};
		container = document.createElement("div");
		document.body.append(container);
		root = createI18nRoot(container);
		query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
		act(() =>
			root.render(
				<QueryClientProvider client={query}>
					<Probe />
				</QueryClientProvider>,
			),
		);
		act(() => {
			actions.resetFormForMarket("synthetic:BTC");
			actions.resetForm();
		});
	});
	afterEach(() => {
		act(() => root.unmount());
		query.clear();
		container.remove();
		vi.unstubAllGlobals();
	});
	async function open(type: OrderSubmitInput["orderType"], pct: number, mode: "base" | "quote") {
		const selected = getReduceOnlySizeSelection("7.15", pct, mode, 95.997, 3);
		if (!selected) throw new Error("Missing selection");
		const stop = type.startsWith("stop");
		const trigger = stop || type.startsWith("takeProfit");
		const input = twapInput({
			orderType: type,
			side: "sell",
			reduceOnly: true,
			sizeValue: Number(selected.baseSize),
			sizeForOrder: selected.baseSize,
			market: { assetId: 0, kind: "perp", name: "BTC", szDecimals: 3 },
			slippageBps: 250,
			limitPriceInput: "100",
			triggerPriceInput: stop ? "90" : "110",
			scaleStartPriceInput: "90",
			scaleEndPriceInput: "110",
			scaleLevelsNum: 4,
			scaleSkewInput: "1",
			twapAdvancedEnabled: false,
			twapOrder: type === "twap",
			scaleOrder: type === "scale",
			triggerOrder: trigger,
		});
		const draft = {
			...DRAFT,
			side: "sell" as const,
			orderType: type,
			reduceOnly: true,
			sizeValue: input.sizeValue,
			sizeForOrder: input.sizeForOrder,
			szDecimals: 3,
			marginRequired: null,
			twapMinutes: 30,
			limitPrice: 100,
			triggerPrice: stop ? 90 : 110,
			scaleStartPrice: 90,
			scaleEndPrice: 110,
			scaleLevels: 4,
			scaleSkew: 1,
		};
		await act(async () => confirmation.requestSubmit(input, draft));
		const rows = document.querySelector('[data-testid="order-confirmation-rows"]');
		const row = [...(rows?.children ?? [])].find((row) => row.querySelector("dt")?.textContent === "Size");
		const displayed = (row?.querySelector("dd")?.textContent ?? "").replace(/ BTC$/, "").replaceAll(",", "");
		expect(Big(displayed).eq(selected.baseSize)).toBe(true);
		expect(mocks.order).not.toHaveBeenCalled();
		expect(mocks.twapOrder).not.toHaveBeenCalled();
		return Big(displayed).toFixed();
	}
	async function confirm() {
		const button = document.querySelector<HTMLButtonElement>('[data-testid="commit-order"]');
		if (!button) throw new Error("Missing confirm");
		await act(async () => {
			button.click();
			await new Promise((resolve) => setTimeout(resolve, 30));
		});
		await vi.waitFor(() => expect(confirmation.isConfirming).toBe(false));
	}
	it.each([
		"market",
		"limit",
		"stopMarket",
		"stopLimit",
		"takeProfitMarket",
		"takeProfitLimit",
		"twap",
		"scale",
	] as const)("%s sends r/b/exact s from the displayed commitment after position growth", async (type) => {
		const displayed = await open(type, 100, "quote");
		state.positionSignedSize = "9";
		await confirm();
		const sdk = type === "twap" ? mocks.twapOrder : mocks.order;
		expect(sdk, JSON.stringify(queue.at(-1))).toHaveBeenCalledTimes(1);
		const request = sdk.mock.calls[0][0];
		const orders = type === "twap" ? [request.twap] : request.orders;
		expect(
			orders.every(
				(o: { r: boolean; b: boolean; s: string }) => o.r === true && o.b === false && typeof o.s === "string",
			),
		).toBe(true);
		expect(orders.reduce((sum: Big, o: { s: string }) => sum.plus(o.s), Big(0)).toFixed()).toBe(displayed);
	});
	for (const mode of ["base", "quote"] as const)
		for (const pct of [50, 100]) {
			it.each(["3", "0", "-7.15", "stale"])(
				`${pct}% ${mode} rejects changed position %s with zero SDK calls`,
				async (position) => {
					await open("market", pct, mode);
					if (position === "stale") state.positionReceivedAt = Date.now() - 60001;
					else state.positionSignedSize = position;
					await confirm();
					expect(mocks.order).not.toHaveBeenCalled();
					expect(mocks.twapOrder).not.toHaveBeenCalled();
					expect(queue.at(-1)?.error).toMatchObject({
						code: position === "stale" ? "live-position-unavailable" : "reduce-only-position-changed",
					});
				},
			);
		}
});
