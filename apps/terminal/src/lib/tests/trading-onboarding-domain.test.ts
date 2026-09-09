import { describe, expect, it } from "vitest";
import { getTradingAccountFundingState } from "@/domain/trade/onboarding";
import { getOrderActionStage } from "@/domain/trade/order-action-stage";

const READY_ACTION = {
	isConnected: true,
	needsChainSwitch: false,
	needsApproval: false,
	isSignerReady: true,
	hasBalanceError: false,
	isBalanceLoading: false,
	availableBalance: 100,
};

const READY_FUNDING = {
	isConnected: true,
	isLoading: false,
	hasError: false,
	hasPerpSnapshot: true,
	hasSpotSnapshot: true,
	perpAccountValues: [] as string[],
	spotBalances: [] as string[],
};

describe("trading onboarding state", () => {
	it("keeps Agent approval ahead of deposits for a new wallet", () => {
		expect(
			getOrderActionStage({
				...READY_ACTION,
				needsApproval: true,
				isSignerReady: false,
				availableBalance: 0,
			}),
		).toBe("agent");
	});

	it("offers deposit before builder approval after Agent registration", () => {
		expect(
			getOrderActionStage({
				...READY_ACTION,
				needsApproval: true,
				availableBalance: 0,
			}),
		).toBe("deposit");
		expect(getOrderActionStage({ ...READY_ACTION, needsApproval: true })).toBe("builder");
	});

	it("does not classify an incomplete account snapshot as empty", () => {
		expect(getTradingAccountFundingState({ ...READY_FUNDING, hasSpotSnapshot: false })).toBe("loading");
		expect(getTradingAccountFundingState({ ...READY_FUNDING, isLoading: true })).toBe("loading");
	});

	it("detects funding in either a perp dex or spot without floating-point conversion", () => {
		expect(getTradingAccountFundingState({ ...READY_FUNDING, perpAccountValues: ["0", "0.00000001"] })).toBe("funded");
		expect(getTradingAccountFundingState({ ...READY_FUNDING, spotBalances: ["0", "5"] })).toBe("funded");
	});

	it("only reports empty after both snapshots are definitive", () => {
		expect(
			getTradingAccountFundingState({
				...READY_FUNDING,
				perpAccountValues: ["0"],
				spotBalances: ["0"],
			}),
		).toBe("empty");
		expect(getTradingAccountFundingState({ ...READY_FUNDING, hasError: true })).toBe("error");
	});
});
