import { getOrderAvailabilityFlags, getOrderAvailabilityStatus } from "@/domain/trade/order/availability";
import { deriveOrderEntry, type OrderEntryDerived } from "@/domain/trade/order/derive";
import { getSizeForPercent as getSizeForPercentCalc, getSizeValueForModeToggle } from "@/domain/trade/order/size";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import type { Side, SizeMode } from "@/lib/trade/types";
import { useDefaultDexBalances } from "./use-account-balances";
import { useAssetLeverage } from "./use-asset-leverage";

interface OrderEntryData extends OrderEntryDerived {
	isConnected: boolean;
	isAvailabilityLoading: boolean;
	isAvailabilityBlocked: boolean;
	isAvailabilityStale: boolean;
	hasAvailabilityError: boolean;

	getSizeForPercent: (pct: number) => string;
	convertSizeForModeToggle: () => string;

	leverage: number;
	currentLeverage: number;
	pendingLeverage: number | null;
	maxLeverage: number;
	setPendingLeverage: (value: number) => void;
	resetPendingLeverage: () => void;
	marginMode: "cross" | "isolated";
	hasPosition: boolean;
	switchMarginMode: (mode: "cross" | "isolated") => Promise<void>;
	applyMarginAndLeverage: (mode: "cross" | "isolated", leverageValue: number) => Promise<void>;
	isSwitchingMode: boolean;
	switchModeError: Error | null;
	isOnlyIsolated: boolean;
	allowsCrossMargin: boolean;
	maxTradeSzs: [number, number] | null;
}

interface UseOrderEntryDataOptions {
	market: UnifiedMarketInfo | undefined;
	side: Side;
	markPx: number;
	sizeMode: SizeMode;
	sizeInput: string;
}

export function useOrderEntryData({
	market,
	side,
	markPx,
	sizeMode,
	sizeInput,
}: UseOrderEntryDataOptions): OrderEntryData {
	const { isConnected } = useWalletSession();
	const { spotBalances, spotAvailableAfterMaintenance, spotStateStatus } = useDefaultDexBalances();
	const {
		displayLeverage: leverage,
		currentLeverage,
		pendingLeverage,
		maxLeverage,
		setPendingLeverage,
		resetPending: resetPendingLeverage,
		maxTradeSzs,
		availableToTrade,
		marginMode,
		hasPosition,
		switchMarginMode,
		applyMarginAndLeverage,
		isSwitchingMode,
		switchModeError,
		isOnlyIsolated,
		allowsCrossMargin,
		subscriptionStatus,
	} = useAssetLeverage();

	const conversionPrice = markPx > 0 ? markPx : 0;
	const availabilityStatus = getOrderAvailabilityStatus({
		isConnected,
		marketKind: market?.kind,
		spotStatus: spotStateStatus,
		perpStatus: subscriptionStatus,
	});
	const {
		isLoading: isAvailabilityLoading,
		isStale: isAvailabilityStale,
		hasError: hasAvailabilityError,
		isBlocked: isAvailabilityBlocked,
	} = getOrderAvailabilityFlags(isConnected, availabilityStatus);

	const derived = deriveOrderEntry({
		isConnected,
		market,
		side,
		conversionPrice,
		sizeMode,
		sizeInput,
		spotBalances,
		spotAvailableAfterMaintenance,
		maxTradeSzs,
		availableToTrade,
	});

	function getSizeForPercent(pct: number): string {
		return getSizeForPercentCalc({
			pct,
			isSpotMarket: derived.isSpotMarket,
			side,
			sizeMode,
			price: conversionPrice,
			maxSize: derived.maxSize,
			spotBalance: derived.spotBalance,
			szDecimals: derived.szDecimals,
		});
	}

	function convertSizeForModeToggle(): string {
		return getSizeValueForModeToggle({
			sizeValue: derived.sizeValue,
			sizeMode,
			price: conversionPrice,
			szDecimals: derived.szDecimals,
		});
	}

	return {
		isConnected,
		isAvailabilityLoading,
		isAvailabilityBlocked,
		isAvailabilityStale,
		hasAvailabilityError,
		...derived,
		getSizeForPercent,
		convertSizeForModeToggle,
		leverage,
		currentLeverage,
		pendingLeverage,
		maxLeverage,
		setPendingLeverage,
		resetPendingLeverage,
		marginMode,
		hasPosition,
		switchMarginMode,
		applyMarginAndLeverage,
		isSwitchingMode,
		switchModeError,
		isOnlyIsolated,
		allowsCrossMargin,
		maxTradeSzs,
	};
}
