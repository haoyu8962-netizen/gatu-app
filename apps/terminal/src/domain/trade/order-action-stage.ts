import type { OrderType } from "@/config/trade";
import { isTriggerOrderType } from "@/lib/trade/order-types";

export type OrderActionStage =
	| "connect"
	| "agent"
	| "balanceError"
	| "balanceLoading"
	| "deposit"
	| "builder"
	| "submit";

interface OrderActionStageInput {
	isConnected: boolean;
	needsApproval: boolean;
	isSignerReady: boolean;
	hasBalanceError: boolean;
	isBalanceLoading: boolean;
	availableBalance: number;
	reduceOnly?: boolean;
	/** False for a trigger order on a funded account, which needs no free balance when it is placed. */
	requiresAvailableBalance?: boolean;
	/** A new account with a confirmed empty snapshot whose mode is set after its first deposit (ADR 0041). */
	isAwaitingFirstDeposit?: boolean;
}

/**
 * Whether placing an entry order needs free balance on its side. Like the official terminal, a stop or
 * take-profit order on a funded perp account needs neither free balance nor size headroom when it is
 * placed; an account that holds nothing is still asked to deposit.
 */
export function entryOrderRequiresAvailableBalance(input: {
	orderType: OrderType;
	isSpotMarket: boolean;
	hasAccountFunds: boolean;
}): boolean {
	return !(isTriggerOrderType(input.orderType) && !input.isSpotMarket && input.hasAccountFunds);
}

export function getOrderActionStage(input: OrderActionStageInput): OrderActionStage {
	if (!input.isConnected) return "connect";
	if (input.needsApproval && !input.isSignerReady) return "agent";
	if (input.isAwaitingFirstDeposit) return "deposit";
	if (input.hasBalanceError) return "balanceError";
	if (input.isBalanceLoading) return "balanceLoading";
	if (!input.reduceOnly && input.requiresAvailableBalance !== false && input.availableBalance <= 0) return "deposit";
	if (input.needsApproval) return "builder";
	return "submit";
}
