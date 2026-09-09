export type OrderActionStage =
	| "connect"
	| "switchChain"
	| "agent"
	| "balanceError"
	| "balanceLoading"
	| "deposit"
	| "builder"
	| "submit";

interface OrderActionStageInput {
	isConnected: boolean;
	needsChainSwitch: boolean;
	needsApproval: boolean;
	isSignerReady: boolean;
	hasBalanceError: boolean;
	isBalanceLoading: boolean;
	availableBalance: number;
}

export function getOrderActionStage(input: OrderActionStageInput): OrderActionStage {
	if (!input.isConnected) return "connect";
	if (input.needsChainSwitch) return "switchChain";
	if (input.needsApproval && !input.isSignerReady) return "agent";
	if (input.hasBalanceError) return "balanceError";
	if (input.isBalanceLoading) return "balanceLoading";
	if (input.availableBalance <= 0) return "deposit";
	if (input.needsApproval) return "builder";
	return "submit";
}
