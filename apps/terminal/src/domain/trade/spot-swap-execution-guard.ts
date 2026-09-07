import type { OrderParameters } from "@nktkas/hyperliquid";
import Big from "big.js";

export const SWAP_ORDERBOOK_MAX_AGE_MS = 15_000;
export const SWAP_BALANCE_MAX_AGE_MS = 60_000;

export type SpotSwapExecutionErrorReason =
	| "balance-changed"
	| "balance-unavailable"
	| "quote-changed"
	| "swap-data-unavailable";

const SPOT_SWAP_EXECUTION_ERROR_MESSAGES: Record<SpotSwapExecutionErrorReason, string> = {
	"balance-changed": "Spot balance changed before submission",
	"balance-unavailable": "Live swap balance is unavailable",
	"quote-changed": "Swap quote changed before submission",
	"swap-data-unavailable": "Live swap data is unavailable",
};

export class SpotSwapExecutionError extends Error {
	constructor(readonly reason: SpotSwapExecutionErrorReason) {
		super(SPOT_SWAP_EXECUTION_ERROR_MESSAGES[reason]);
		this.name = "SpotSwapExecutionError";
	}
}

export interface SpotSwapExecutionState {
	active: boolean;
	accountDataReady: boolean;
	assetId: number | undefined;
	marketName: string | undefined;
	bookCoin: string | undefined;
	bookStatus: "idle" | "subscribing" | "active" | "error";
	bookIsStale: boolean;
	bookReceivedAt: number | undefined;
	balanceReceivedAt: number | undefined;
	currentBalance: string;
	requiredInput: string;
	expectedOrder: OrderParameters["orders"][number] | undefined;
}

export function assertSpotSwapExecutionAllowed(
	params: OrderParameters,
	state: SpotSwapExecutionState,
	now = Date.now(),
): void {
	const bookAge = state.bookReceivedAt === undefined ? Number.POSITIVE_INFINITY : now - state.bookReceivedAt;
	const balanceAge = state.balanceReceivedAt === undefined ? Number.POSITIVE_INFINITY : now - state.balanceReceivedAt;
	if (
		!state.active ||
		!state.accountDataReady ||
		state.assetId === undefined ||
		!state.marketName ||
		state.bookCoin !== state.marketName ||
		state.bookStatus !== "active" ||
		state.bookIsStale ||
		bookAge < 0 ||
		bookAge > SWAP_ORDERBOOK_MAX_AGE_MS ||
		balanceAge < 0 ||
		balanceAge > SWAP_BALANCE_MAX_AGE_MS ||
		!state.expectedOrder ||
		params.grouping !== "na" ||
		params.orders.length !== 1
	) {
		throw new SpotSwapExecutionError("swap-data-unavailable");
	}
	try {
		if (new Big(state.requiredInput).lte(0) || new Big(state.requiredInput).gt(new Big(state.currentBalance))) {
			throw new SpotSwapExecutionError("balance-changed");
		}
	} catch (error) {
		if (error instanceof SpotSwapExecutionError) throw error;
		throw new SpotSwapExecutionError("balance-unavailable");
	}

	const [order] = params.orders;
	const expected = state.expectedOrder;
	if (
		order.a !== state.assetId ||
		order.a !== expected.a ||
		order.b !== expected.b ||
		order.p !== expected.p ||
		order.s !== expected.s ||
		order.r !== expected.r ||
		!("limit" in order.t) ||
		order.t.limit.tif !== "FrontendMarket"
	) {
		throw new SpotSwapExecutionError("quote-changed");
	}
}
