import { msg } from "@lingui/core/macro";
import type { ActiveAssetDataWsEvent } from "@nktkas/hyperliquid";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_MAX_LEVERAGE } from "@/config/trade";
import { getPositionDex } from "@/domain/market";
import {
	canRemoveIsolatedMargin as getCanRemoveIsolatedMargin,
	getPerpMarginConstraint,
} from "@/domain/trade/isolated-margin";
import type { AssetAvailabilityStatus } from "@/domain/trade/order/availability";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
import { type ExchangeParams, getMarketCapabilities, useExchange, useUserPositions } from "@/lib/hyperliquid";
import { getMarginModeFromLeverage, type MarginMode } from "@/lib/trade/margin-mode";
import { toNumber } from "@/lib/trade/numbers";
import { useGlobalSettingsActions, useMarginMode, useNetwork } from "@/stores/use-global-settings-store";
import { useActiveAssetData } from "./use-active-asset-data";

type OperationType = "leverage" | "mode" | null;
type LeverageExecutionIntent = {
	kind: "leverage" | "mode" | "modeAndLeverage";
	mode: MarginMode;
	leverage: number;
};
type DisconnectedLeverageState = {
	transactionIdentity: string;
	value: number;
};
type PendingLeverageState = {
	transactionIdentity: string;
	value: number;
};
type CommittedLeverageSettings = {
	transactionIdentity: string;
	mode: MarginMode;
	leverage: number;
	observedSnapshot: ActiveAssetDataWsEvent | undefined;
	observedReceivedAt: number | undefined;
};

const ACTIVE_ASSET_DATA_MAX_AGE_MS = 20_000;
const USER_POSITION_MAX_AGE_MS = 60_000;

interface LeverageExecutionState {
	transactionIdentity: string;
	activeAssetSnapshot: ActiveAssetDataWsEvent | undefined;
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
		throw new LocalizedActionError(msg`Leverage request no longer matches the selected market`);
	}

	if (
		typeof params.leverage !== "number" ||
		!Number.isSafeInteger(params.leverage) ||
		!Number.isFinite(state.maxLeverage) ||
		state.maxLeverage < 1 ||
		params.leverage < 1 ||
		params.leverage > state.maxLeverage
	) {
		throw new LocalizedActionError(msg`Invalid leverage`);
	}

	if (typeof params.isCross !== "boolean") {
		throw new LocalizedActionError(msg`Invalid margin mode`);
	}

	if (state.intent !== null) {
		if (params.isCross !== (state.intent.mode === "cross") || params.leverage !== state.intent.leverage) {
			throw new LocalizedActionError(msg`Leverage request no longer matches the confirmed settings`);
		}
		if (state.intent.kind === "leverage" && state.marginMode !== state.intent.mode) {
			throw new LocalizedActionError(msg`Margin mode changed before leverage update`);
		}
		if (state.intent.kind === "mode" && state.currentLeverage !== state.intent.leverage) {
			throw new LocalizedActionError(msg`Leverage changed before margin mode update`);
		}
	}

	if (params.isCross && (state.isOnlyIsolated || !state.allowsCrossMargin)) {
		throw new LocalizedActionError(msg`This market only supports isolated margin mode`);
	}

	if (!state.isOnlyIsolated && !state.marginModeStateReady) {
		throw new LocalizedActionError(msg`Margin mode data is unavailable`);
	}

	if (!state.activeAssetStateReady) {
		throw new LocalizedActionError(msg`Active asset data is unavailable`);
	}
	const activeAssetAge =
		state.activeAssetReceivedAt === undefined ? Number.POSITIVE_INFINITY : Date.now() - state.activeAssetReceivedAt;
	if (activeAssetAge < 0 || activeAssetAge > ACTIVE_ASSET_DATA_MAX_AGE_MS) {
		throw new LocalizedActionError(msg`Active asset data is unavailable`);
	}

	if (!params.isCross && state.marginMode === "cross") {
		const positionAge =
			state.positionReceivedAt === undefined ? Number.POSITIVE_INFINITY : Date.now() - state.positionReceivedAt;
		if (!state.positionStateReady || positionAge < 0 || positionAge > USER_POSITION_MAX_AGE_MS) {
			throw new LocalizedActionError(msg`Position data is unavailable`);
		}
		if (state.hasPosition) throw new LocalizedActionError(msg`Cannot switch to isolated mode with an open position`);
	}
}

interface UseAssetLeverageReturn {
	transactionIdentity: string;
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
	applyMarginAndLeverage: (mode: MarginMode, leverageValue: number) => Promise<number | null>;
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
	return new LocalizedActionError(msg`Another action for this market is already in progress.`);
}

function getLeverageExecutionIntentKind(
	modeChanged: boolean,
	leverageChanged: boolean,
): LeverageExecutionIntent["kind"] {
	if (!modeChanged) return "leverage";
	if (leverageChanged) return "modeAndLeverage";
	return "mode";
}

export function useAssetLeverage(): UseAssetLeverageReturn {
	const {
		accountAddress,
		data: currentActiveAssetData,
		isConnected,
		market,
		receivedAt: subscriptionReceivedAt,
		status: subscriptionStatus,
	} = useActiveAssetData();

	const storedMarginMode = useMarginMode();
	const network = useNetwork();
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
	const [pendingLeverageState, setPendingLeverageState] = useState<PendingLeverageState | null>(null);
	const [committedLeverageSettingsState, setCommittedLeverageSettingsState] =
		useState<CommittedLeverageSettings | null>(null);
	const [disconnectedLeverageState, setDisconnectedLeverageState] = useState<DisconnectedLeverageState | null>(null);

	const onChainLeverage = currentActiveAssetData?.leverage?.value ?? null;
	const onChainMarginMode = getMarginModeFromLeverage(currentActiveAssetData?.leverage);

	function computeAuthoritativeMarginMode(): MarginMode {
		if (isOnlyIsolated) {
			return "isolated";
		}
		if (isConnected && currentActiveAssetData?.leverage) {
			return onChainMarginMode;
		}
		return storedMarginMode;
	}
	const authoritativeMarginMode = computeAuthoritativeMarginMode();
	const activeAssetStateReady = !isConnected || subscriptionStatus === "success";
	const marginModeStateReady =
		isOnlyIsolated ||
		!isConnected ||
		(subscriptionStatus === "success" && currentActiveAssetData?.leverage !== undefined);

	const positionDex = market ? getPositionDex(market) : undefined;
	const hasPosition = baseToken ? userPositions.getPosition(baseToken, positionDex) !== null : false;
	const positionStateReady =
		!isConnected || (!userPositions.isLoading && !userPositions.hasError && !userPositions.isStale);
	const transactionIdentity = [
		network,
		accountAddress?.toLowerCase() ?? (isConnected ? "connected" : "disconnected"),
		market?.kind ?? "unknown",
		assetId ?? "unknown",
		baseToken ?? "unknown",
	].join(":");

	const disconnectedLeverage =
		disconnectedLeverageState?.transactionIdentity === transactionIdentity
			? normalizeLeverage(disconnectedLeverageState.value, maxLeverage)
			: null;

	function computeAuthoritativeLeverage(): number {
		if (isConnected && onChainLeverage !== null) {
			return onChainLeverage;
		}
		if (disconnectedLeverage !== null) {
			return disconnectedLeverage;
		}
		return getDefaultLeverage(maxLeverage);
	}
	const currentLeverage = computeAuthoritativeLeverage();
	const committedLeverageSettings =
		committedLeverageSettingsState?.transactionIdentity === transactionIdentity
			? {
					...committedLeverageSettingsState,
					leverage: normalizeLeverage(committedLeverageSettingsState.leverage, maxLeverage),
				}
			: null;
	const committedLeverage = committedLeverageSettings?.leverage ?? null;
	const marginMode = committedLeverageSettings?.mode ?? authoritativeMarginMode;
	const effectiveLeverage = committedLeverage ?? currentLeverage;
	const normalizedPendingLeverage =
		pendingLeverageState?.transactionIdentity === transactionIdentity
			? normalizeLeverage(pendingLeverageState.value, maxLeverage)
			: null;
	const pendingLeverage = normalizedPendingLeverage === effectiveLeverage ? null : normalizedPendingLeverage;
	const leverageExecutionStateRef = useRef<LeverageExecutionState>({
		transactionIdentity,
		activeAssetSnapshot: currentActiveAssetData,
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
		currentLeverage: effectiveLeverage,
		intent: executionIntentRef.current,
	});
	// Update during render so a queued mutation cannot observe the previous render's market or position state.
	leverageExecutionStateRef.current = {
		transactionIdentity,
		activeAssetSnapshot: currentActiveAssetData,
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
		currentLeverage: effectiveLeverage,
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

	const displayLeverage = pendingLeverage ?? effectiveLeverage;
	const isDirty = pendingLeverage !== null;

	useEffect(() => {
		setDisconnectedLeverageState((previous) => {
			if (previous?.transactionIdentity !== transactionIdentity) return previous;
			const normalizedValue = normalizeLeverage(previous.value, maxLeverage);
			return normalizedValue === previous.value ? previous : { ...previous, value: normalizedValue };
		});
		setCommittedLeverageSettingsState((previous) => {
			if (previous?.transactionIdentity !== transactionIdentity) return previous;
			const normalizedLeverage = normalizeLeverage(previous.leverage, maxLeverage);
			return normalizedLeverage === previous.leverage ? previous : { ...previous, leverage: normalizedLeverage };
		});
		setPendingLeverageState((previous) => {
			if (previous?.transactionIdentity !== transactionIdentity) return previous;
			const normalizedValue = normalizeLeverage(previous.value, maxLeverage);
			if (normalizedValue === effectiveLeverage) return null;
			return normalizedValue === previous.value ? previous : { ...previous, value: normalizedValue };
		});
	}, [effectiveLeverage, maxLeverage, transactionIdentity]);

	useEffect(() => {
		const committedSettings = committedLeverageSettingsState;
		if (
			committedSettings?.transactionIdentity !== transactionIdentity ||
			subscriptionStatus !== "success" ||
			currentActiveAssetData?.leverage === undefined
		)
			return;
		const subscribedLeverage = normalizeLeverage(currentActiveAssetData.leverage.value, maxLeverage);
		const subscribedMode = isOnlyIsolated ? "isolated" : onChainMarginMode;
		const committedLeverageValue = normalizeLeverage(committedSettings.leverage, maxLeverage);
		const subscriptionMatches =
			committedLeverageValue === subscribedLeverage && committedSettings.mode === subscribedMode;
		const hasDifferentReceipt =
			subscriptionReceivedAt !== undefined &&
			(committedSettings.observedReceivedAt === undefined ||
				subscriptionReceivedAt !== committedSettings.observedReceivedAt);
		const hasSuccessorSnapshot = currentActiveAssetData !== committedSettings.observedSnapshot || hasDifferentReceipt;
		if (!subscriptionMatches && !hasSuccessorSnapshot) return;
		setCommittedLeverageSettingsState((current) => (current === committedSettings ? null : current));
	}, [
		committedLeverageSettingsState,
		currentActiveAssetData,
		isOnlyIsolated,
		maxLeverage,
		onChainMarginMode,
		subscriptionReceivedAt,
		subscriptionStatus,
		transactionIdentity,
	]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: transaction identity is the external session boundary
	useEffect(() => {
		setPendingLeverageState(null);
		setCommittedLeverageSettingsState(null);
		setDisconnectedLeverageState(null);
		operationTypeRef.current = null;
		executionIntentRef.current = null;
		resetMutation();
	}, [transactionIdentity, resetMutation]);

	const setPendingLeverage = useCallback(
		(value: number) => {
			if (!Number.isFinite(value)) return;
			const clamped = normalizeLeverage(value, maxLeverage);
			if (!isConnected) {
				setDisconnectedLeverageState({ transactionIdentity, value: clamped });
				setPendingLeverageState(null);
				return;
			}
			if (clamped === effectiveLeverage) {
				setPendingLeverageState(null);
			} else {
				setPendingLeverageState({ transactionIdentity, value: clamped });
			}
		},
		[effectiveLeverage, isConnected, maxLeverage, transactionIdentity],
	);

	const resetPending = useCallback(() => {
		if (requestInFlightRef.current) return;
		setPendingLeverageState(null);
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
		const requestIdentity = transactionIdentity;
		requestInFlightRef.current = true;
		try {
			await updateLeverage({
				asset: assetId,
				isCross: marginMode === "cross",
				leverage: pendingLeverage,
			});

			if (leverageExecutionStateRef.current.transactionIdentity !== requestIdentity) return;
			setCommittedLeverageSettingsState({
				transactionIdentity: requestIdentity,
				mode: marginMode,
				leverage: pendingLeverage,
				observedSnapshot: leverageExecutionStateRef.current.activeAssetSnapshot,
				observedReceivedAt: leverageExecutionStateRef.current.activeAssetReceivedAt,
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
			throw new LocalizedActionError(msg`This market only supports isolated margin mode`);
		}

		if (!isConnected) {
			setStoredMarginMode(mode);
			return;
		}

		if (mode === "isolated" && marginMode === "cross") {
			if (!positionStateReady) throw new LocalizedActionError(msg`Position data is unavailable`);
			if (hasPosition) throw new LocalizedActionError(msg`Cannot switch to isolated mode with an open position`);
		}

		operationTypeRef.current = "mode";
		executionIntentRef.current = { kind: "mode", mode, leverage: effectiveLeverage };
		const requestIdentity = transactionIdentity;
		requestInFlightRef.current = true;
		try {
			await updateLeverage({
				asset: assetId,
				isCross: mode === "cross",
				leverage: effectiveLeverage,
			});

			if (leverageExecutionStateRef.current.transactionIdentity !== requestIdentity) return;
			setStoredMarginMode(mode);
			setCommittedLeverageSettingsState({
				transactionIdentity: requestIdentity,
				mode,
				leverage: effectiveLeverage,
				observedSnapshot: leverageExecutionStateRef.current.activeAssetSnapshot,
				observedReceivedAt: leverageExecutionStateRef.current.activeAssetReceivedAt,
			});
		} finally {
			requestInFlightRef.current = false;
		}
	}

	const applyMarginAndLeverage = useCallback(
		async (mode: MarginMode, leverageValue: number) => {
			if (!isPerpMarket || typeof assetId !== "number") return null;
			if (!Number.isFinite(leverageValue)) throw new LocalizedActionError(msg`Invalid leverage`);
			if (requestInFlightRef.current) throw leverageUpdateInProgressError();

			const clamped = normalizeLeverage(leverageValue, maxLeverage);
			const modeChanged = mode !== marginMode;
			const leverageChanged = clamped !== effectiveLeverage;
			if (!modeChanged && !leverageChanged) {
				setPendingLeverageState(null);
				return null;
			}

			if (isOnlyIsolated && mode === "cross") {
				throw new LocalizedActionError(msg`This market only supports isolated margin mode`);
			}

			if (!isConnected) {
				setStoredMarginMode(mode);
				setDisconnectedLeverageState({ transactionIdentity, value: clamped });
				setPendingLeverageState(null);
				return clamped;
			}

			if (mode === "isolated" && marginMode === "cross") {
				if (!positionStateReady) throw new LocalizedActionError(msg`Position data is unavailable`);
				if (hasPosition) throw new LocalizedActionError(msg`Cannot switch to isolated mode with an open position`);
			}

			const intentKind = getLeverageExecutionIntentKind(modeChanged, leverageChanged);
			operationTypeRef.current = intentKind === "leverage" ? "leverage" : "mode";
			executionIntentRef.current = { kind: intentKind, mode, leverage: clamped };
			const requestIdentity = transactionIdentity;
			requestInFlightRef.current = true;
			try {
				await updateLeverage({
					asset: assetId,
					isCross: mode === "cross",
					leverage: clamped,
				});

				if (leverageExecutionStateRef.current.transactionIdentity !== requestIdentity) return null;
				setStoredMarginMode(mode);
				setCommittedLeverageSettingsState({
					transactionIdentity: requestIdentity,
					mode,
					leverage: clamped,
					observedSnapshot: leverageExecutionStateRef.current.activeAssetSnapshot,
					observedReceivedAt: leverageExecutionStateRef.current.activeAssetReceivedAt,
				});
				setPendingLeverageState(null);
				return clamped;
			} finally {
				requestInFlightRef.current = false;
			}
		},
		[
			assetId,
			effectiveLeverage,
			hasPosition,
			isConnected,
			isOnlyIsolated,
			isPerpMarket,
			marginMode,
			maxLeverage,
			positionStateReady,
			setStoredMarginMode,
			transactionIdentity,
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
		transactionIdentity,
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
