import { useLingui } from "@lingui/react/macro";
import { useRef } from "react";
import { SIDE_LABELS } from "@/config/trade-panel-labels";
import type { SideLabels } from "@/config/ui-text";
import { getSpotAvailableValue, getSpotBalance, hasAccountFunds } from "@/domain/trade/balances";
import { getMarketOpenInterestCapStatus } from "@/domain/trade/open-interest-cap";
import {
	type AssetAvailabilityStatus,
	getAccountModeAvailabilityStatus,
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
	getSizeValueForModeToggle,
} from "@/domain/trade/order/size";
import { entryOrderRequiresAvailableBalance } from "@/domain/trade/order-action-stage";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import type { Side, SizeMode } from "@/lib/trade/types";
import { useOrderEntryActions, useOrderSizeSource, useOrderType } from "@/stores/use-order-entry-store";
import { type AccountAbstraction, isSupportedAccountAbstraction, useDefaultDexBalances } from "./use-account-balances";
import { useAccountModeSetupKind } from "./use-account-mode-setup";
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
	isAwaitingFirstDeposit: boolean;
	/** False for a trigger order on a funded perp account; see `entryOrderRequiresAvailableBalance`. */
	requiresAvailableBalance: boolean;
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
	/** A scale order's value for a total size, from its actual levels; see `getOrderEntryValueForSize`. */
	orderValueForSize?: (size: string) => number | undefined;
	/** The margin a resting perp order reserves; see `getOrderEntryMarginNotionalForSize`. */
	marginNotionalForSize?: (size: string) => number | undefined;
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
	orderValueForSize,
	marginNotionalForSize,
	marketOrderSizing,
	reduceOnly = false,
	positionSnapshot,
}: UseOrderEntryDataOptions): OrderEntryData {
	const { t } = useLingui();
	const { address, isConnected } = useWalletSession();
	const {
		accountAbstraction,
		isLoading: areBalancesLoading,
		allDexClearinghouseStates,
		perpStateStatus: allDexsPerpStateStatus,
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
	const accountModeSetup = useAccountModeSetupKind(accountAbstraction, address);
	const availabilityStatus = getAccountModeAvailabilityStatus({
		isConnected,
		isModeSupported: isSupportedAccountAbstraction(accountAbstraction),
		areBalancesLoading,
		accountModeSetup,
		streamStatus: streamAvailabilityStatus,
	});
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
	const selectedBaseSize =
		effectiveReduceOnly && sizeSource?.context === `${sizeContext}:${sizeMode}` ? sizeSource.baseSize : undefined;
	const derived = deriveOrderEntry({
		reduceOnly: effectiveReduceOnly,
		positionSnapshot,
		selectedBaseSize,
		isConnected,
		market,
		side,
		conversionPrice,
		markPx,
		orderValueForSize,
		marginNotionalForSize,
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
			const size = getSizeForPercent(pct);
			if (size) setSize(size);
		}
	}
	function toggleSizeDenomination() {
		const mode = sizeMode === "base" ? "quote" : "base";
		if (effectiveReduceOnly && sizeInput.trim()) {
			const baseSize = derived.sizeForOrder;
			const size = getSelectedSizeDisplay(baseSize, mode, conversionPrice, derived.szDecimals);
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
		isAwaitingFirstDeposit: isConnected && accountModeSetup === "awaiting-funds",
		requiresAvailableBalance: entryOrderRequiresAvailableBalance({
			orderType,
			isSpotMarket: derived.isSpotMarket,
			hasAccountFunds:
				isConnected &&
				hasAccountFunds({
					perpStateStatus: allDexsPerpStateStatus,
					spotStateStatus,
					clearinghouseStates: allDexClearinghouseStates,
					spotBalances,
				}),
		}),
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
