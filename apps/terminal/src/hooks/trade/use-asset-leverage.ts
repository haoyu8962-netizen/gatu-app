import { t } from "@lingui/core/macro";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_MAX_LEVERAGE } from "@/config/trade";
import { getPositionDex } from "@/domain/market";
import {
	canRemoveIsolatedMargin as getCanRemoveIsolatedMargin,
	getPerpMarginConstraint,
} from "@/domain/trade/isolated-margin";
import { type AssetAvailabilityStatus, getAssetAvailabilityStatus } from "@/domain/trade/order/availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import {
	type ExchangeParams,
	getMarketCapabilities,
	useExchange,
	useSelectedMarketInfo,
	useSubscription,
	useUserPositions,
} from "@/lib/hyperliquid";
import { getMarginModeFromLeverage, type MarginMode } from "@/lib/trade/margin-mode";
import { toNumber } from "@/lib/trade/numbers";
import { useGlobalSettingsActions, useMarginMode } from "@/stores/use-global-settings-store";

type OperationType = "leverage" | "mode" | null;

interface LeverageExecutionState {
	assetId: number | undefined;
	isPerpMarket: boolean;
	maxLeverage: number;
	isOnlyIsolated: boolean;
	allowsCrossMargin: boolean;
	activeAssetStateReady: boolean;
	marginMode: MarginMode;
	marginModeStateReady: boolean;
	positionStateReady: boolean;
	hasPosition: boolean;
}

function assertLeverageExecutionAllowed(params: ExchangeParams<"updateLeverage">, state: LeverageExecutionState): void {
	if (
		!state.isPerpMarket ||
		typeof state.assetId !== "number" ||
		typeof params.asset !== "number" ||
		!Number.isSafeInteger(state.assetId) ||
		!Number.isSafeInteger(params.asset) ||
		params.asset !== state.assetId
	) {
		throw new Error("Leverage request no longer matches the selected market");
	}

	if (
		typeof params.leverage !== "number" ||
		!Number.isSafeInteger(params.leverage) ||
		!Number.isFinite(state.maxLeverage) ||
		state.maxLeverage < 1 ||
		params.leverage < 1 ||
		params.leverage > state.maxLeverage
	) {
		throw new Error("Invalid leverage");
	}

	if (typeof params.isCross !== "boolean") {
		throw new Error("Invalid margin mode");
	}

	if (params.isCross && (state.isOnlyIsolated || !state.allowsCrossMargin)) {
		throw new Error("This market only supports isolated margin mode");
	}

	if (!state.isOnlyIsolated && !state.marginModeStateReady) {
		throw new Error("Margin mode data is unavailable");
	}

	if (!state.activeAssetStateReady) {
		throw new Error("Active asset data is unavailable");
	}

	if (!params.isCross && state.marginMode === "cross") {
		if (!state.positionStateReady) throw new Error("Position data is unavailable");
		if (state.hasPosition) throw new Error("Cannot switch to isolated mode with an open position");
	}
}

interface UseAssetLeverageReturn {
	currentLeverage: number;
	pendingLeverage: number | null;
	maxLeverage: number;
	displayLeverage: number;
	isDirty: boolean;
	isConnected: boolean;
	setPendingLeverage: (value: number) => void;
	confirmLeverage: () => Promise<void>;
	resetPending: () => void;
	/** Max trade sizes in base token: [long, short] */
	maxTradeSzs: [number, number] | null;
	/** Available to trade in quote token: [long, short] */
	availableToTrade: [number, number] | null;
	isUpdating: boolean;
	updateError: Error | null;
	subscriptionStatus: AssetAvailabilityStatus;
	marginMode: MarginMode;
	hasPosition: boolean;
	positionStateReady: boolean;
	switchMarginMode: (mode: MarginMode) => Promise<void>;
	applyMarginAndLeverage: (mode: MarginMode, leverageValue: number) => Promise<void>;
	isSwitchingMode: boolean;
	switchModeError: Error | null;
	isOnlyIsolated: boolean;
	allowsCrossMargin: boolean;
	allowsIsolatedMarginRemoval: boolean;
}

function getDefaultLeverage(maxLeverage: number): number {
	return Math.min(10, maxLeverage);
}

function leverageUpdateInProgressError(): Error {
	return new Error(t`Another action for this market is already in progress.`);
}

export function useAssetLeverage(): UseAssetLeverageReturn {
	const { address, isConnected } = useWalletSession();
	const { data: market } = useSelectedMarketInfo();

	const storedMarginMode = useMarginMode();
	const { setMarginMode: setStoredMarginMode } = useGlobalSettingsActions();

	const capabilities = getMarketCapabilities(market);
	const { isOnlyIsolated, allowsCrossMargin } = capabilities;
	const isPerpMarket = market?.kind === "perp" || market?.kind === "builderPerp";
	const marginConstraint = isPerpMarket ? getPerpMarginConstraint(market) : undefined;
	const allowsIsolatedMarginRemoval = getCanRemoveIsolatedMargin(marginConstraint);

	const maxLeverage = market?.kind === "spot" ? 1 : (market?.maxLeverage ?? DEFAULT_MAX_LEVERAGE);
	const baseToken = market ? market.name : undefined;
	const assetId = market?.assetId;

	const {
		data: activeAssetData,
		status: subscriptionStatus,
		isStale,
	} = useSubscription(
		"activeAssetData",
		{ coin: baseToken ?? "", user: address ?? "" },
		{ enabled: isConnected && !!address && !!baseToken && isPerpMarket },
	);
	const normalizedStatus = getAssetAvailabilityStatus({
		isConnected,
		isPerpMarket,
		coin: baseToken,
		user: address,
		data: activeAssetData,
		subscriptionStatus,
		isStale,
	});
	const currentActiveAssetData =
		normalizedStatus === "success" || normalizedStatus === "stale" ? activeAssetData : undefined;

	const userPositions = useUserPositions();

	const operationTypeRef = useRef<OperationType>(null);
	const requestInFlightRef = useRef(false);
	const [pendingLeverage, setPendingLeverageState] = useState<number | null>(null);
	const [disconnectedLeverage, setDisconnectedLeverage] = useState<number | null>(null);

	const onChainLeverage = currentActiveAssetData?.leverage?.value ?? null;
	const onChainMarginMode = getMarginModeFromLeverage(currentActiveAssetData?.leverage);

	function computeMarginMode(): MarginMode {
		if (isOnlyIsolated) {
			return "isolated";
		}
		if (isConnected && currentActiveAssetData?.leverage) {
			return onChainMarginMode;
		}
		return storedMarginMode;
	}
	const marginMode = computeMarginMode();
	const activeAssetStateReady = !isConnected || normalizedStatus === "success";
	const marginModeStateReady =
		isOnlyIsolated ||
		!isConnected ||
		(normalizedStatus === "success" && currentActiveAssetData?.leverage !== undefined);

	const positionDex = market ? getPositionDex(market) : undefined;
	const hasPosition = baseToken ? userPositions.getPosition(baseToken, positionDex) !== null : false;
	const positionStateReady =
		!isConnected || (!userPositions.isLoading && !userPositions.hasError && !userPositions.isStale);

	function computeCurrentLeverage(): number {
		if (isConnected && onChainLeverage !== null) {
			return onChainLeverage;
		}
		if (disconnectedLeverage !== null) {
			return disconnectedLeverage;
		}
		return getDefaultLeverage(maxLeverage);
	}
	const currentLeverage = computeCurrentLeverage();
	const leverageExecutionStateRef = useRef<LeverageExecutionState>({
		assetId,
		isPerpMarket,
		maxLeverage,
		isOnlyIsolated,
		allowsCrossMargin,
		activeAssetStateReady,
		marginMode,
		marginModeStateReady,
		positionStateReady,
		hasPosition,
	});
	// Update during render so a queued mutation cannot observe the previous render's market or position state.
	leverageExecutionStateRef.current = {
		assetId,
		isPerpMarket,
		maxLeverage,
		isOnlyIsolated,
		allowsCrossMargin,
		activeAssetStateReady,
		marginMode,
		marginModeStateReady,
		positionStateReady,
		hasPosition,
	};

	const {
		mutateAsync: updateLeverage,
		isPending,
		error,
		reset: resetMutation,
	} = useExchange("updateLeverage", {
		executionGuard: (params) => assertLeverageExecutionAllowed(params, leverageExecutionStateRef.current),
	});

	const displayLeverage = pendingLeverage ?? currentLeverage;
	const isDirty = pendingLeverage !== null && pendingLeverage !== currentLeverage;

	// biome-ignore lint/correctness/useExhaustiveDependencies: baseToken change triggers reset
	useEffect(() => {
		setPendingLeverageState(null);
		operationTypeRef.current = null;
		resetMutation();
	}, [baseToken, resetMutation]);

	const setPendingLeverage = useCallback(
		(value: number) => {
			if (!Number.isFinite(value)) return;
			const clamped = Math.max(1, Math.min(Math.round(value), maxLeverage));
			if (!isConnected) {
				setDisconnectedLeverage(clamped);
				setPendingLeverageState(null);
				return;
			}
			if (clamped === currentLeverage) {
				setPendingLeverageState(null);
			} else {
				setPendingLeverageState(clamped);
			}
		},
		[currentLeverage, isConnected, maxLeverage],
	);

	const resetPending = useCallback(() => {
		if (requestInFlightRef.current) return;
		setPendingLeverageState(null);
		operationTypeRef.current = null;
		resetMutation();
	}, [resetMutation]);

	async function confirmLeverage() {
		if (!isPerpMarket || pendingLeverage === null || typeof assetId !== "number") {
			return;
		}
		if (requestInFlightRef.current) throw leverageUpdateInProgressError();

		operationTypeRef.current = "leverage";
		requestInFlightRef.current = true;
		try {
			await updateLeverage({
				asset: assetId,
				isCross: marginMode === "cross",
				leverage: pendingLeverage,
			});

			setPendingLeverageState(null);
		} finally {
			requestInFlightRef.current = false;
		}
	}

	async function switchMarginMode(mode: MarginMode) {
		if (!isPerpMarket || typeof assetId !== "number") return;
		if (requestInFlightRef.current) throw leverageUpdateInProgressError();

		if (isOnlyIsolated && mode === "cross") {
			throw new Error("This market only supports isolated margin mode");
		}

		if (!isConnected) {
			setStoredMarginMode(mode);
			return;
		}

		if (mode === "isolated" && marginMode === "cross") {
			if (!positionStateReady) throw new Error("Position data is unavailable");
			if (hasPosition) throw new Error("Cannot switch to isolated mode with an open position");
		}

		operationTypeRef.current = "mode";
		requestInFlightRef.current = true;
		try {
			await updateLeverage({
				asset: assetId,
				isCross: mode === "cross",
				leverage: currentLeverage,
			});

			setStoredMarginMode(mode);
		} finally {
			requestInFlightRef.current = false;
		}
	}

	const applyMarginAndLeverage = useCallback(
		async (mode: MarginMode, leverageValue: number) => {
			if (!isPerpMarket || typeof assetId !== "number") return;
			if (!Number.isFinite(leverageValue)) throw new Error("Invalid leverage");
			if (requestInFlightRef.current) throw leverageUpdateInProgressError();

			const clamped = Math.max(1, Math.min(Math.round(leverageValue), maxLeverage));

			if (isOnlyIsolated && mode === "cross") {
				throw new Error("This market only supports isolated margin mode");
			}

			if (!isConnected) {
				setStoredMarginMode(mode);
				setDisconnectedLeverage(clamped);
				setPendingLeverageState(null);
				return;
			}

			if (mode === "isolated" && marginMode === "cross") {
				if (!positionStateReady) throw new Error("Position data is unavailable");
				if (hasPosition) throw new Error("Cannot switch to isolated mode with an open position");
			}

			operationTypeRef.current = "mode";
			requestInFlightRef.current = true;
			try {
				await updateLeverage({
					asset: assetId,
					isCross: mode === "cross",
					leverage: clamped,
				});

				setStoredMarginMode(mode);
				setPendingLeverageState(null);
			} finally {
				requestInFlightRef.current = false;
			}
		},
		[
			assetId,
			hasPosition,
			isConnected,
			isOnlyIsolated,
			isPerpMarket,
			marginMode,
			maxLeverage,
			positionStateReady,
			setStoredMarginMode,
			updateLeverage,
		],
	);

	function computeMaxTradeSzs(): [number, number] | null {
		const raw = currentActiveAssetData?.maxTradeSzs;
		if (!raw) return null;
		const long = toNumber(raw[0]);
		const short = toNumber(raw[1]);
		return long !== null && short !== null ? [long, short] : null;
	}
	const maxTradeSzs = computeMaxTradeSzs();

	function computeAvailableToTrade(): [number, number] | null {
		const raw = currentActiveAssetData?.availableToTrade;
		if (!raw) return null;
		const long = toNumber(raw[0]);
		const short = toNumber(raw[1]);
		return long !== null && short !== null ? [long, short] : null;
	}
	const availableToTrade = computeAvailableToTrade();

	const isUpdating = isPending && operationTypeRef.current === "leverage";
	const isSwitchingMode = isPending && operationTypeRef.current === "mode";
	const updateError = error && operationTypeRef.current === "leverage" ? (error as Error) : null;
	const switchModeError = error && operationTypeRef.current === "mode" ? (error as Error) : null;

	return {
		currentLeverage,
		pendingLeverage,
		maxLeverage,
		displayLeverage,
		isDirty,
		isConnected,
		setPendingLeverage,
		confirmLeverage,
		resetPending,
		maxTradeSzs,
		availableToTrade,
		isUpdating,
		updateError,
		subscriptionStatus: normalizedStatus,
		marginMode,
		hasPosition,
		positionStateReady,
		switchMarginMode,
		applyMarginAndLeverage,
		isSwitchingMode,
		switchModeError,
		isOnlyIsolated,
		allowsCrossMargin,
		allowsIsolatedMarginRemoval,
	};
}
