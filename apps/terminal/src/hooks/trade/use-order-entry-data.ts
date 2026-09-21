import { useLingui } from "@lingui/react/macro";
import { SIDE_LABELS } from "@/config/trade-panel-labels";
import type { SideLabels } from "@/config/ui-text";
import { getSpotAvailableValue, getSpotBalance } from "@/domain/trade/balances";
import {
	type AssetAvailabilityStatus,
	getOrderAvailabilityFlags,
	getOrderAvailabilityStatus,
} from "@/domain/trade/order/availability";
import { deriveOrderEntry, type MarketOrderSizingInput, type OrderEntryDerived } from "@/domain/trade/order/derive";
import type { EntryOrderExecutionAvailability } from "@/domain/trade/order/entry-execution-guard";
import { getSizeForPercent as getSizeForPercentCalc, getSizeValueForModeToggle } from "@/domain/trade/order/size";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import type { Side, SizeMode } from "@/lib/trade/types";
import { type AccountAbstraction, isSupportedAccountAbstraction, useDefaultDexBalances } from "./use-account-balances";
import { useAssetLeverage } from "./use-asset-leverage";

interface OrderEntryData extends OrderEntryDerived {
	accountAbstraction: AccountAbstraction;
	isConnected: boolean;
	availabilityStatus: AssetAvailabilityStatus;
	availabilityReceivedAt: number | undefined;
	availabilityMaxAgeMs: number;
	executionAvailability: EntryOrderExecutionAvailability;
	isAvailabilityLoading: boolean;
	isAvailabilityBlocked: boolean;
	isAvailabilityStale: boolean;
	hasAvailabilityError: boolean;
	sideLabels: SideLabels;

	getSizeForPercent: (pct: number) => string;
	convertSizeForModeToggle: () => string;

	leverage: number;
	leverageInteractionIdentity: string;
	currentLeverage: number;
	pendingLeverage: number | null;
	committedLeverage: number | null;
	maxLeverage: number;
	setPendingLeverage: (value: number) => void;
	resetPendingLeverage: () => void;
	marginMode: "cross" | "isolated";
	hasPosition: boolean;
	positionStateReady: boolean;
	switchMarginMode: (mode: "cross" | "isolated") => Promise<void>;
	applyMarginAndLeverage: (mode: "cross" | "isolated", leverageValue: number) => Promise<number | null>;
	isLeverageUpdating: boolean;
	leverageUpdateError: Error | null;
	isSwitchingMode: boolean;
	switchModeError: Error | null;
	isOnlyIsolated: boolean;
	allowsCrossMargin: boolean;
	allowsIsolatedMarginRemoval: boolean;
	maxTradeSzs: [number, number] | null;
}

interface UseOrderEntryDataOptions {
	market: UnifiedMarketInfo | undefined;
	side: Side;
	markPx: number;
	sizeMode: SizeMode;
	sizeInput: string;
	/** Limit price for limit-priced order types; when > 0 it drives size/value conversion instead of mark. */
	limitPx?: number;
	marketOrderSizing: MarketOrderSizingInput | null;
}

export function useOrderEntryData({
	market,
	side,
	markPx,
	sizeMode,
	sizeInput,
	limitPx,
	marketOrderSizing,
}: UseOrderEntryDataOptions): OrderEntryData {
	const { t } = useLingui();
	const { isConnected } = useWalletSession();
	const {
		accountAbstraction,
		isLoading: areBalancesLoading,
		spotBalances,
		spotAvailableAfterMaintenance,
		spotStateStatus,
		spotStateReceivedAt,
	} = useDefaultDexBalances();
	const {
		transactionIdentity: leverageInteractionIdentity,
		displayLeverage: leverage,
		currentLeverage,
		pendingLeverage,
		committedLeverage,
		maxLeverage,
		setPendingLeverage,
		resetPending: resetPendingLeverage,
		maxTradeSzs,
		maxTradeSzsRaw,
		availableToTrade,
		marginMode,
		hasPosition,
		positionStateReady,
		switchMarginMode,
		applyMarginAndLeverage,
		isUpdating: isLeverageUpdating,
		updateError: leverageUpdateError,
		isSwitchingMode,
		switchModeError,
		isOnlyIsolated,
		allowsCrossMargin,
		allowsIsolatedMarginRemoval,
		subscriptionStatus,
		subscriptionReceivedAt,
	} = useAssetLeverage();

	const conversionPrice = getConversionPrice(markPx, limitPx);
	const isSpotMarket = market?.kind === "spot";
	const streamAvailabilityStatus = getOrderAvailabilityStatus({
		isConnected,
		marketKind: market?.kind,
		spotStatus: spotStateStatus,
		perpStatus: subscriptionStatus,
	});
	const availabilityStatus =
		isConnected && !isSupportedAccountAbstraction(accountAbstraction)
			? areBalancesLoading
				? "loading"
				: "error"
			: streamAvailabilityStatus;
	const availabilityReceivedAt = isSpotMarket ? spotStateReceivedAt : subscriptionReceivedAt;
	const availabilityMaxAgeMs = isSpotMarket ? 60_000 : 20_000;
	const baseSpotBalance = getSpotBalance(
		spotBalances,
		market?.kind === "spot" ? (market.tokensInfo[0]?.name ?? "") : "",
	);
	const quoteSpotBalance = getSpotBalance(
		spotBalances,
		market?.kind === "spot" ? (market.tokensInfo[1]?.name ?? "") : "",
	);
	const executionAvailability: EntryOrderExecutionAvailability = isSpotMarket
		? {
				kind: "spot",
				baseAvailable: getSpotAvailableValue(baseSpotBalance, spotAvailableAfterMaintenance),
				quoteAvailable: getSpotAvailableValue(quoteSpotBalance, spotAvailableAfterMaintenance),
			}
		: {
				kind: "perp",
				maxBaseBySide: { buy: maxTradeSzsRaw?.[0], sell: maxTradeSzsRaw?.[1] },
			};
	const {
		isLoading: isAvailabilityLoading,
		isStale: isAvailabilityStale,
		hasError: hasAvailabilityError,
		isBlocked: isAvailabilityBlocked,
	} = getOrderAvailabilityFlags(isConnected, availabilityStatus);
	const sideLabels: SideLabels = isSpotMarket
		? { buy: t(SIDE_LABELS.buy), sell: t(SIDE_LABELS.sell), buyAria: t(SIDE_LABELS.buy), sellAria: t(SIDE_LABELS.sell) }
		: {
				buy: t(SIDE_LABELS.long),
				sell: t(SIDE_LABELS.short),
				buyAria: t(SIDE_LABELS.buyLong),
				sellAria: t(SIDE_LABELS.sellShort),
			};

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
		marketOrderSizing,
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
		accountAbstraction,
		isConnected,
		availabilityStatus,
		availabilityReceivedAt,
		availabilityMaxAgeMs,
		executionAvailability,
		isAvailabilityLoading,
		isAvailabilityBlocked,
		isAvailabilityStale,
		hasAvailabilityError,
		...derived,
		sideLabels,
		getSizeForPercent,
		convertSizeForModeToggle,
		leverage,
		leverageInteractionIdentity,
		currentLeverage,
		pendingLeverage,
		committedLeverage,
		maxLeverage,
		setPendingLeverage,
		resetPendingLeverage,
		marginMode,
		hasPosition,
		positionStateReady,
		switchMarginMode,
		applyMarginAndLeverage,
		isLeverageUpdating,
		leverageUpdateError,
		isSwitchingMode,
		switchModeError,
		isOnlyIsolated,
		allowsCrossMargin,
		allowsIsolatedMarginRemoval,
		maxTradeSzs,
	};
}

export function getConversionPrice(markPx: number, limitPx: number | undefined): number {
	if (typeof limitPx === "number" && limitPx > 0) return limitPx;
	return markPx > 0 ? markPx : 0;
}
