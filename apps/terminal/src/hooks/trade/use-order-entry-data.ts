import { useLingui } from "@lingui/react/macro";
import { useRef } from "react";
import { SIDE_LABELS } from "@/config/trade-panel-labels";
import type { SideLabels } from "@/config/ui-text";
import { getSpotAvailableValue, getSpotBalance } from "@/domain/trade/balances";
import { getMarketOpenInterestCapStatus } from "@/domain/trade/open-interest-cap";
import {
	type AssetAvailabilityStatus,
	getOrderAvailabilityFlags,
	getOrderAvailabilityStatus,
} from "@/domain/trade/order/availability";
import { deriveOrderEntry, type MarketOrderSizingInput, type OrderEntryDerived } from "@/domain/trade/order/derive";
import type { EntryOrderExecutionAvailability } from "@/domain/trade/order/entry-execution-guard";
import type { EntryPositionSnapshot } from "@/domain/trade/order/reduce-only";
import {
	getReduceOnlySizeSelection,
	getSelectedSizeDisplay,
	getSizeForPercent as getSizeForPercentCalc,
	getSizeStringFromInput,
	getSizeValueForModeToggle,
} from "@/domain/trade/order/size";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import type { Side, SizeMode } from "@/lib/trade/types";
import { useOrderEntryActions, useOrderSizeSource, useOrderType } from "@/stores/use-order-entry-store";
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
	isBalanceAvailabilityBlocked: boolean;
	conversionPrice: number;
	isAvailabilityStale: boolean;
	hasAvailabilityError: boolean;
	isOpenInterestCapped: boolean;
	sideLabels: SideLabels;

	applySizePercent: (pct: number) => void;
	beginSizePercentGesture: () => void;
	endSizePercentGesture: () => void;
	toggleSizeDenomination: () => void;

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
	reduceOnly?: boolean;
	positionSnapshot?: EntryPositionSnapshot;
	market: UnifiedMarketInfo | undefined;
	side: Side;
	markPx: number;
	sizeMode: SizeMode;
	sizeInput: string;
	/** Limit price for limit-priced order types; when > 0 it drives size/value conversion instead of mark. */
	limitPx?: number;
	marketOrderSizing: MarketOrderSizingInput | null;
}

interface SizePercentBasis {
	isSpotMarket: boolean;
	sizeMode: SizeMode;
	price: number;
	maxSize: number;
	spotBalance: OrderEntryDerived["spotBalance"];
	szDecimals: number;
	reduceOnlyMaxBase: string;
}

export function useOrderEntryData({
	market,
	side,
	markPx,
	sizeMode,
	sizeInput,
	limitPx,
	marketOrderSizing,
	reduceOnly = false,
	positionSnapshot,
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
		perpsAtOpenInterestCap,
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
	const isOpenInterestCapped = getMarketOpenInterestCapStatus(perpsAtOpenInterestCap, market) === "capped";
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

	const sizeSource = useOrderSizeSource();
	const orderType = useOrderType();
	const { setSize, setSizeSelection, setSizeMode } = useOrderEntryActions();
	const effectiveReduceOnly = reduceOnly && !isSpotMarket;
	const sizeContext = `${leverageInteractionIdentity}:${market?.assetId}:${side}:${orderType}:${effectiveReduceOnly}`;
	const selectedBaseSize = sizeSource?.context === `${sizeContext}:${sizeMode}` ? sizeSource.baseSize : undefined;
	const derived = deriveOrderEntry({
		reduceOnly: effectiveReduceOnly,
		positionSnapshot,
		selectedBaseSize,
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

	const sizePercentBasisRef = useRef<SizePercentBasis | null>(null);
	const currentSizePercentBasis: SizePercentBasis = {
		isSpotMarket: derived.isSpotMarket,
		sizeMode,
		price: conversionPrice,
		maxSize: derived.maxSize,
		spotBalance: derived.spotBalance,
		szDecimals: derived.szDecimals,
		reduceOnlyMaxBase: derived.reduceOnlyCapacity.maxBase,
	};
	function beginSizePercentGesture() {
		sizePercentBasisRef.current = currentSizePercentBasis;
	}
	function endSizePercentGesture() {
		sizePercentBasisRef.current = null;
	}
	function getSizePercentBasis(): SizePercentBasis {
		return sizePercentBasisRef.current ?? currentSizePercentBasis;
	}

	function getSizeForPercent(pct: number): string {
		const basis = getSizePercentBasis();
		return getSizeForPercentCalc({
			pct,
			isSpotMarket: basis.isSpotMarket,
			side,
			sizeMode: basis.sizeMode,
			price: basis.price,
			maxSize: basis.maxSize,
			spotBalance: basis.spotBalance,
			szDecimals: basis.szDecimals,
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

	function applySizePercent(pct: number) {
		if (effectiveReduceOnly) {
			const basis = getSizePercentBasis();
			const selection = getReduceOnlySizeSelection(
				basis.reduceOnlyMaxBase,
				pct,
				basis.sizeMode,
				basis.price,
				basis.szDecimals,
			);
			if (selection)
				setSizeSelection(selection.size, { context: `${sizeContext}:${sizeMode}`, baseSize: selection.baseSize });
		} else {
			const basis = getSizePercentBasis();
			const size = getSizeForPercent(pct);
			if (!size) return;
			if (basis.sizeMode === "quote") {
				const baseSize = getSizeStringFromInput({
					sizeInput: size,
					sizeMode: "quote",
					price: basis.price,
					szDecimals: basis.szDecimals,
				});
				setSizeSelection(size, { context: `${sizeContext}:${sizeMode}`, baseSize });
				return;
			}
			setSize(size);
		}
	}
	function toggleSizeDenomination() {
		const mode = sizeMode === "base" ? "quote" : "base";
		if (effectiveReduceOnly && sizeInput.trim()) {
			const baseSize = derived.sizeForOrder;
			const size = getSelectedSizeDisplay(baseSize, mode, conversionPrice);
			if (size !== null) {
				setSizeSelection(size, { context: `${sizeContext}:${mode}`, baseSize }, mode);
				return;
			}
		}
		const size = convertSizeForModeToggle();
		setSizeMode(mode);
		if (size) setSize(size);
	}
	return {
		applySizePercent,
		beginSizePercentGesture,
		endSizePercentGesture,
		toggleSizeDenomination,
		accountAbstraction,
		isConnected,
		availabilityStatus,
		availabilityReceivedAt,
		availabilityMaxAgeMs,
		executionAvailability,
		isAvailabilityLoading,
		isAvailabilityBlocked: isAvailabilityBlocked || derived.reduceOnlyCapacity.status === "unavailable",
		isBalanceAvailabilityBlocked: isAvailabilityBlocked,
		conversionPrice,
		isAvailabilityStale,
		hasAvailabilityError,
		isOpenInterestCapped,
		...derived,
		sideLabels,
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
