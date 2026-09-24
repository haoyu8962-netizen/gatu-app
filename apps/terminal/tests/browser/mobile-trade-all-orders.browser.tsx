import { useSyncExternalStore } from "react";
import type { MarkPriceStatus } from "@/domain/trade/market-price";
import type { OrderSubmitDraftInput } from "@/hooks/trade/use-order-submit";
import type { PerpMarketInfo, UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import { getOrderEntryDraftResetToken } from "@/stores/use-order-entry-store";

export { isSupportedAccountAbstraction } from "@/domain/trade/account-abstraction";
export { getMarketCapabilities } from "../../../../packages/hl-react/src/capabilities";

const owner = "0x0000000000000000000000000000000000000001";
const listeners = new Set<() => void>();
const empty = () => {};
const builderUsdh = new URLSearchParams(window.location.search).get("market") === "builder-usdh";
let state = {
	connected: true,
	funded: true,
	status: "success" as MarkPriceStatus,
	accountStatus: undefined as MarkPriceStatus | undefined,
	positionPending: false,
	positionStatus: "success" as MarkPriceStatus,
	positionSize: new URLSearchParams(window.location.search).get("position") ?? "0",
	submissions: [] as OrderSubmitDraftInput[],
};
export function setFixtureState(next: Partial<typeof state>) {
	state = { ...state, ...next };
	for (const listener of listeners) listener();
}
export function useFixtureState() {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => state,
	);
}
export function useWalletSession() {
	const current = useFixtureState();
	return { address: current.connected ? owner : undefined, isConnected: current.connected };
}
export function useWalletClient() {
	return { data: { account: { address: owner } }, error: null, isLoading: false };
}
export function useConnection() {
	return { address: owner, isConnected: true };
}
export function useSwitchChain() {
	return { isPending: false, switchChain: empty };
}
export function useSelectedMarketInfo(): { data: UnifiedMarketInfo } {
	const current = useFixtureState();
	const perp: PerpMarketInfo = {
		assetId: 0,
		kind: "perp",
		name: "BTC",
		shortName: "BTC",
		routeName: "BTC",
		ctxIndex: 0,
		iconUrl: undefined,
		pairName: "BTC-USDC",
		szDecimals: 3,
		maxLeverage: 20,
		marginTableId: 1,
		markPx: "100",
		midPx: "100",
		prevDayPx: "100",
		markPriceStatus: current.status,
		markPriceReceivedAt: Date.now(),
		midPriceReceivedAt: Date.now(),
	};
	if (!builderUsdh) return { data: perp };
	return {
		data: {
			...perp,
			kind: "builderPerp",
			assetId: 100000,
			name: "xyz:BTC",
			routeName: "xyz:BTC",
			pairName: "BTC-USDH",
			dex: "xyz",
			dexIndex: 0,
			deployerFeeScale: "1",
			quoteToken: {
				name: "USDH",
				displayName: "USDH",
				fullName: "USDH",
				szDecimals: 2,
				weiDecimals: 6,
				transferDecimals: 6,
				index: 150,
				tokenId: "0x00000000000000000000000000000000",
				isCanonical: true,
				evmContract: null,
				iconUrl: undefined,
				isWrapped: false,
				deployerTradingFeeShare: "0",
			},
		},
	};
}
export function useMarketsInfo() {
	const market = useSelectedMarketInfo();
	return { getMarketByName: () => market.data, spotMarkets: [], isLoading: false, error: null };
}
export function useOrderbookMidPrice() {
	return { midPx: "100" };
}
export function useDefaultDexBalances() {
	const current = useFixtureState();
	return {
		accountAbstraction: "disabled",
		isLoading: false,
		spotBalances: [],
		spotAvailableAfterMaintenance: [],
		spotStateStatus: current.accountStatus ?? current.status,
		spotStateReceivedAt: Date.now(),
	};
}
export function useAssetLeverage() {
	const current = useFixtureState();
	const balance = current.funded ? 1000 : 0;
	return {
		transactionIdentity: builderUsdh ? "fixture:xyz:BTC" : "fixture:BTC",
		displayLeverage: 10,
		currentLeverage: 10,
		pendingLeverage: null,
		committedLeverage: null,
		maxLeverage: 20,
		setPendingLeverage: empty,
		resetPending: empty,
		maxTradeSzs: current.funded ? [10, 10] : [0, 0],
		maxTradeSzsRaw: current.funded ? ["10", "10"] : ["0", "0"],
		availableToTrade: [balance, balance],
		marginMode: "cross",
		hasPosition: false,
		positionStateReady: true,
		switchMarginMode: async () => {},
		applyMarginAndLeverage: async () => {},
		isUpdating: false,
		updateError: null,
		isSwitchingMode: false,
		switchModeError: null,
		isOnlyIsolated: false,
		allowsCrossMargin: true,
		allowsIsolatedMarginRemoval: true,
		subscriptionStatus: current.accountStatus ?? current.status,
		subscriptionReceivedAt: Date.now(),
	};
}
export function useTradingStatus() {
	return {
		isReady: true,
		isSignerReady: true,
		isSignerLoading: false,
		isBuilderFeeLoading: false,
		signerMode: "embedded-owner",
	};
}
export function useTradingAuthorization() {
	return { authorize: async () => false, status: "idle" };
}
export function useTradingGuard() {
	return {
		isReady: true,
		isEnabling: false,
		needsTrading: false,
		enableTrading: async () => {},
		guardAction: (action: () => void) => action(),
		error: null,
	};
}
export function useUserPositions() {
	const current = useFixtureState();
	return {
		getPosition: (coin: string, dex?: string) =>
			current.positionSize === "0" ||
			coin !== (builderUsdh ? "xyz:BTC" : "BTC") ||
			(dex ?? "") !== (builderUsdh ? "xyz" : "")
				? null
				: {
						szi: current.positionSize,
						coin: builderUsdh ? "xyz:BTC" : "BTC",
						dex: builderUsdh ? "xyz" : "",
						entryPx: "100",
						positionValue: "715",
						unrealizedPnl: "0",
						returnOnEquity: "0",
						liquidationPx: null,
						marginUsed: "71.5",
						maxLeverage: 20,
						leverage: { type: "cross", value: 10 },
						cumFunding: { allTime: "0", sinceOpen: "0", sinceChange: "0" },
					},
		hasError: current.positionStatus === "error",
		isLoading: current.positionPending || current.positionStatus === "loading",
		isStale: current.positionStatus === "stale",
		receivedAt: current.positionStatus === "stale" ? Date.now() - 60_001 : Date.now(),
	};
}
export function useInfo() {
	return { data: undefined };
}
export function useSubscription() {
	return { data: undefined, status: "idle", isStale: false };
}
export function useHyperliquid() {
	return { env: "Mainnet" };
}
export function useMarketNavigation() {
	return empty;
}
export function useProspectiveCrossMarginAccount() {
	return { account: null, existingPosition: null };
}
export function useDepositAvailability() {
	return { available: true, unavailableReason: null };
}
export function useMarketFeeRates() {
	return { makerRate: 0.0001, takerRate: 0.00045 };
}
export function useBuilderFeeTenthsBps() {
	return 0;
}
export function useGeoRestriction() {
	return { actionsBlocked: false, isResolved: true, isError: false, tradeRestricted: false };
}
export function useAccountAbstractionControl() {
	return {
		accountAbstraction: "disabled",
		canSet: false,
		isLoading: false,
		isUpdating: false,
		portfolioMarginActivationEnabled: false,
		setAccountAbstraction: async () => false,
	};
}
export function toSelectableAccountAbstraction() {
	return "disabled";
}
export function useOrderSubmit() {
	return {
		isSubmitting: false,
		captureDraftResetToken: () => ({ orderEntry: getOrderEntryDraftResetToken() }),
		isDraftResetTokenCurrent: (token: { orderEntry: ReturnType<typeof getOrderEntryDraftResetToken> }) => {
			const current = getOrderEntryDraftResetToken();
			return (
				token.orderEntry.marketIdentity === current.marketIdentity &&
				token.orderEntry.draftRevision === current.draftRevision
			);
		},
		handleSubmit: async (input: OrderSubmitDraftInput) =>
			setFixtureState({ submissions: [...state.submissions, input] }),
	};
}
export function TokenSelector() {
	return null;
}
export function WalletModal() {
	return null;
}
