import { create } from "zustand";

interface FixtureState {
	connected: boolean;
	ownerWallet: boolean;
	mode: "disabled" | "unifiedAccount" | "portfolioMargin";
	ready: boolean;
	sponsored: boolean;
	geo: "allowed" | "restricted" | "unresolved";
	actions: string[];
}

export const useAccountActionsFixture = create<FixtureState>(() => ({
	connected: true,
	ownerWallet: true,
	mode: "disabled",
	ready: true,
	sponsored: false,
	geo: "allowed",
	actions: [],
}));

export function setAccountActionsFixture(patch: Partial<FixtureState>) {
	useAccountActionsFixture.setState(patch);
}

function recordAction(action: string) {
	useAccountActionsFixture.setState((state) => ({ actions: [...state.actions, action] }));
}

export function useWalletSession() {
	const state = useAccountActionsFixture();
	return {
		isConnected: state.connected,
		hasWalletAccess: state.ownerWallet,
		walletAddress: state.ownerWallet ? "0x1111111111111111111111111111111111111111" : undefined,
	};
}

export function useAccountOverview() {
	const state = useAccountActionsFixture();
	return {
		accountAbstraction: state.mode,
		accountEquityValue: "1403.71",
		accountMode:
			state.mode === "disabled" ? "separate" : state.mode === "unifiedAccount" ? "unified" : "portfolioMargin",
		accountRisk: { progressPercent: "25.05", tone: "safe" },
		crossLeverage: 5.01,
		fundsActionsReady: state.ready,
		maintenanceMarginRatio: "0.2505",
		marginRatioReady: state.ready,
		riskSummary: { unrealizedPnl: "-28.15", crossMaintenanceMarginUsed: "351.59" },
		snapshotReady: state.ready,
		status: "success",
		unrealizedPnlTone: "negative",
		usesSharedQuoteBalance: state.mode !== "disabled",
		valuationUnavailable: false,
	};
}

export function useGeoRestriction() {
	const state = useAccountActionsFixture();
	return {
		isResolved: state.geo !== "unresolved",
		isError: false,
		proxy: false,
		tradeRestricted: state.geo === "restricted",
		retry: async () => ({ data: { country: "US", proxy: false, tradeRestricted: false }, isError: false }),
	};
}

export function useDepositAvailability() {
	const state = useAccountActionsFixture();
	const geoBlocked = state.geo !== "allowed";
	const available = !geoBlocked && (state.ownerWallet || state.sponsored);
	return {
		available,
		path: state.sponsored ? "sponsored" : "external",
		reason: geoBlocked
			? state.geo === "restricted"
				? "geo-restricted"
				: "geo-unresolved"
			: available
				? null
				: "wallet-session-required",
		unavailableLabel: "Deposit unavailable",
		unavailableReason: geoBlocked
			? "Deposits are not available in this region."
			: available
				? null
				: "Connect the owner wallet to deposit.",
	};
}

export function useHasExistingBridgeExecution() {
	return false;
}

export function useDepositModalActions() {
	return { open: (mode: string) => recordAction(mode) };
}

export function useTransferModalActions() {
	return { open: (mode: string) => recordAction(mode) };
}
