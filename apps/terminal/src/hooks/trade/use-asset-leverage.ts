import { t } from "@lingui/core/macro";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_MAX_LEVERAGE } from "@/config/trade";
import { getPositionDex } from "@/domain/market";
import {
	canRemoveIsolatedMargin as getCanRemoveIsolatedMargin,
	getPerpMarginConstraint,
} from "@/domain/trade/isolated-margin";
import type { AssetAvailabilityStatus } from "@/domain/trade/order/availability";
import { type ExchangeParams, getMarketCapabilities, useExchange, useUserPositions } from "@/lib/hyperliquid";
import { getMarginModeFromLeverage, type MarginMode } from "@/lib/trade/margin-mode";
import { toNumber } from "@/lib/trade/numbers";
import { useGlobalSettingsActions, useMarginMode } from "@/stores/use-global-settings-store";
import { useActiveAssetData } from "./use-active-asset-data";

type OperationType = "leverage" | "mode" | null;
type LeverageExecutionIntent = {
	kind: "leverage" | "mode" | "modeAndLeverage";
	mode: MarginMode;
	leverage: number;
};

const ACTIVE_ASSET_DATA_MAX_AGE_MS = 20_000;
const USER_POSITION_MAX_AGE_MS = 60_000;

interface LeverageExecutionState {
	assetId: number | undefined;
	isPerpMarket: boolean;
	maxLeverage: number;
	isOnlyIsolated: boolean;
	allowsCrossMargin: boolean;
	activeAssetStateReady: boolean;
	activeAssetReceivedAt: number | undefined;
	marginMode: MarginMode;
	marginModeStateReady: boolean;
	positionStateReady: boolean;
	positionReceivedAt: number | undefined;
	hasPosition: boolean;
	currentLeverage: number;
	intent: LeverageExecutionIntent | null;
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

	if (state.intent !== null) {
		if (params.isCross !== (state.intent.mode === "cross") || params.leverage !== state.intent.leverage) {
			throw new Error("Leverage request no longer matches the confirmed settings");
		}
		if (state.intent.kind === "leverage" && state.marginMode !== state.intent.mode) {
			throw new Error("Margin mode changed before leverage update");
		}
		if (state.intent.kind === "mode" && state.currentLeverage !== state.intent.leverage) {
			throw new Error("Leverage changed before margin mode update");
		}
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
	const activeAssetAge =
		state.activeAssetReceivedAt === undefined ? Number.POSITIVE_INFINITY : Date.now() - state.activeAssetReceivedAt;
	if (activeAssetAge < 0 || activeAssetAge > ACTIVE_ASSET_DATA_MAX_AGE_MS) {
		throw new Error("Active asset data is unavailable");
	}

	if (!params.isCross && state.marginMode === "cross") {
		const positionAge =
			state.positionReceivedAt === undefined ? Number.POSITIVE_INFINITY : Date.now() - state.positionReceivedAt;
		if (!state.positionStateReady || positionAge < 0 || positionAge > USER_POSITION_MAX_AGE_MS) {
			throw new Error("Position data is unavailable");
		}
		if (state.hasPosition) throw new Error("Cannot switch to isolated mode with an open position");
	}
}

interface UseAssetLeverageReturn {
	currentLeverage: number;
	pendingLeverage: number | null;
	committedLeverage: number | null;
	maxLeverage: number;
	displayLeverage: number;
	isDirty: boolean;
	isConnected: boolean;
	setPendingLeverage: (value: number) => void;
	confirmLeverage: () => Promise<void>;
	resetPending: () => void;
	/** Max trade sizes in base token: [buy, sell]. */
	maxTradeSzs: [number, number] | null;
	/** Exact protocol max trade sizes in base token: [buy, sell]. */
	maxTradeSzsRaw: [string, string] | null;
	/** Available to trade in quote token: [buy, sell]. */
	availableToTrade: [number, number] | null;
	isUpdating: boolean;
	updateError: Error | null;
	subscriptionStatus: AssetAvailabilityStatus;
	subscriptionReceivedAt: number | undefined;
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

function normalizeLeverage(value: number, maxLeverage: number): number {
	const normalizedMax = Number.isFinite(maxLeverage) ? Math.max(1, Math.floor(maxLeverage)) : 1;
	return Math.max(1, Math.min(Math.round(value), normalizedMax));
}

function leverageUpdateInProgressError(): Error {
	return new Error(t`Another action for this market is already in progress.`);
}

export function useAssetLeverage(): UseAssetLeverageReturn {
	const {
		data: currentActiveAssetData,
		isConnected,
		market,
		receivedAt: subscriptionReceivedAt,
		status: subscriptionStatus,
	} = useActiveAssetData();

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

	const userPositions = useUserPositions();

	const operationTypeRef = useRef<OperationType>(null);
	const executionIntentRef = useRef<LeverageExecutionIntent | null>(null);
	const requestInFlightRef = useRef(false);
	const [pendingLeverageState, setPendingLeverageState] = useState<number | null>(null);
	const [committedLeverageState, setCommittedLeverageState] = useState<number | null>(null);
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
	const activeAssetStateReady = !isConnected || subscriptionStatus === "success";
	const marginModeStateReady =
		isOnlyIsolated ||
		!isConnected ||
		(subscriptionStatus === "success" && currentActiveAssetData?.leverage !== undefined);

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
	const normalizedPendingLeverage =
		pendingLeverageState === null ? null : normalizeLeverage(pendingLeverageState, maxLeverage);
	const pendingLeverage = normalizedPendingLeverage === currentLeverage ? null : normalizedPendingLeverage;
	const committedLeverage =
		committedLeverageState === null ? null : normalizeLeverage(committedLeverageState, maxLeverage);
	const leverageExecutionStateRef = useRef<LeverageExecutionState>({
		assetId,
		isPerpMarket,
		maxLeverage,
		isOnlyIsolated,
		allowsCrossMargin,
		activeAssetStateReady,
		activeAssetReceivedAt: subscriptionReceivedAt,
		marginMode,
		marginModeStateReady,
		positionStateReady,
		positionReceivedAt: userPositions.receivedAt,
		hasPosition,
		currentLeverage,
		intent: executionIntentRef.current,
	});
	// Update during render so a queued mutation cannot observe the previous render's market or position state.
	leverageExecutionStateRef.current = {
		assetId,
		isPerpMarket,
		maxLeverage,
		isOnlyIsolated,
		allowsCrossMargin,
		activeAssetStateReady,
		activeAssetReceivedAt: subscriptionReceivedAt,
		marginMode,
		marginModeStateReady,
		positionStateReady,
		positionReceivedAt: userPositions.receivedAt,
		hasPosition,
		currentLeverage,
		intent: executionIntentRef.current,
	};

	const {
		mutateAsync: updateLeverage,
		isPending,
		error,
		reset: resetMutation,
	} = useExchange("updateLeverage", {
		executionGuard: (params) =>
			assertLeverageExecutionAllowed(params, {
				...leverageExecutionStateRef.current,
				intent: executionIntentRef.current,
			}),
	});

	const displayLeverage = pendingLeverage ?? committedLeverage ?? currentLeverage;
	const isDirty = pendingLeverage !== null && pendingLeverage !== currentLeverage;

	useEffect(() => {
		setPendingLeverageState((previous) => {
			if (previous === null) return previous;
			const next = normalizeLeverage(previous, maxLeverage);
			return next === currentLeverage ? null : next === previous ? previous : next;
		});
		setCommittedLeverageState((previous) => {
			if (previous === null) return previous;
			const next = normalizeLeverage(previous, maxLeverage);
			return next === currentLeverage ? null : next === previous ? previous : next;
		});
	}, [currentLeverage, maxLeverage]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: baseToken change triggers reset
	useEffect(() => {
		setPendingLeverageState(null);
		setCommittedLeverageState(null);
		operationTypeRef.current = null;
		executionIntentRef.current = null;
		resetMutation();
	}, [baseToken, resetMutation]);

	const setPendingLeverage = useCallback(
		(value: number) => {
			if (!Number.isFinite(value)) return;
			const clamped = normalizeLeverage(value, maxLeverage);
			setCommittedLeverageState(null);
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
		setCommittedLeverageState(null);
		operationTypeRef.current = null;
		executionIntentRef.current = null;
		resetMutation();
	}, [resetMutation]);

	async function confirmLeverage() {
		if (!isPerpMarket || pendingLeverage === null || typeof assetId !== "number") {
			return;
		}
		if (requestInFlightRef.current) throw leverageUpdateInProgressError();

		operationTypeRef.current = "leverage";
		executionIntentRef.current = { kind: "leverage", mode: marginMode, leverage: pendingLeverage };
		requestInFlightRef.current = true;
		try {
			await updateLeverage({
				asset: assetId,
				isCross: marginMode === "cross",
				leverage: pendingLeverage,
			});

			setCommittedLeverageState(pendingLeverage);
			setPendingLeverageState(pendingLeverage === currentLeverage ? null : pendingLeverage);
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
		executionIntentRef.current = { kind: "mode", mode, leverage: currentLeverage };
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

			const clamped = normalizeLeverage(leverageValue, maxLeverage);
			const modeChanged = mode !== marginMode;
			const leverageChanged = clamped !== currentLeverage;
			if (!modeChanged && !leverageChanged) {
				setPendingLeverageState(null);
				setCommittedLeverageState(clamped);
				return;
			}

			if (isOnlyIsolated && mode === "cross") {
				throw new Error("This market only supports isolated margin mode");
			}

			if (!isConnected) {
				setStoredMarginMode(mode);
				setDisconnectedLeverage(clamped);
				setPendingLeverageState(null);
				setCommittedLeverageState(clamped);
				return;
			}

			if (mode === "isolated" && marginMode === "cross") {
				if (!positionStateReady) throw new Error("Position data is unavailable");
				if (hasPosition) throw new Error("Cannot switch to isolated mode with an open position");
			}

			const intentKind = modeChanged ? (leverageChanged ? "modeAndLeverage" : "mode") : "leverage";
			operationTypeRef.current = intentKind === "leverage" ? "leverage" : "mode";
			executionIntentRef.current = { kind: intentKind, mode, leverage: clamped };
			requestInFlightRef.current = true;
			try {
				await updateLeverage({
					asset: assetId,
					isCross: mode === "cross",
					leverage: clamped,
				});

				setStoredMarginMode(mode);
				setCommittedLeverageState(clamped);
				setPendingLeverageState(clamped === currentLeverage ? null : clamped);
			} finally {
				requestInFlightRef.current = false;
			}
		},
		[
			assetId,
			currentLeverage,
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
		const buy = toNumber(raw[0]);
		const sell = toNumber(raw[1]);
		return buy !== null && sell !== null ? [buy, sell] : null;
	}
	const maxTradeSzs = computeMaxTradeSzs();
	const rawMaxTradeSzs = currentActiveAssetData?.maxTradeSzs;
	const maxTradeSzsRaw: [string, string] | null =
		maxTradeSzs && rawMaxTradeSzs ? [String(rawMaxTradeSzs[0]), String(rawMaxTradeSzs[1])] : null;

	function computeAvailableToTrade(): [number, number] | null {
		const raw = currentActiveAssetData?.availableToTrade;
		if (!raw) return null;
		const buy = toNumber(raw[0]);
		const sell = toNumber(raw[1]);
		return buy !== null && sell !== null ? [buy, sell] : null;
	}
	const availableToTrade = computeAvailableToTrade();

	const isUpdating = isPending && operationTypeRef.current === "leverage";
	const isSwitchingMode = isPending && operationTypeRef.current === "mode";
	const updateError = error && operationTypeRef.current === "leverage" ? (error as Error) : null;
	const switchModeError = error && operationTypeRef.current === "mode" ? (error as Error) : null;

	return {
		currentLeverage,
		pendingLeverage,
		committedLeverage,
		maxLeverage,
		displayLeverage,
		isDirty,
		isConnected,
		setPendingLeverage,
		confirmLeverage,
		resetPending,
		maxTradeSzs,
		maxTradeSzsRaw,
		availableToTrade,
		isUpdating,
		updateError,
		subscriptionStatus,
		subscriptionReceivedAt,
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
