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
}

export function getOrderActionStage(input: OrderActionStageInput): OrderActionStage {
	if (!input.isConnected) return "connect";
	if (input.needsApproval && !input.isSignerReady) return "agent";
	if (input.hasBalanceError) return "balanceError";
	if (input.isBalanceLoading) return "balanceLoading";
	if (!input.reduceOnly && input.availableBalance <= 0) return "deposit";
	if (input.needsApproval) return "builder";
	return "submit";
}
