import { useEffect, useRef, useState } from "react";
import { assertIsolatedRiskIncreaseAllowed } from "@/config/isolated-risk";
import { DEFAULT_MAX_LEVERAGE } from "@/config/trade";
import { type AssetAvailabilityStatus, getAssetAvailabilityStatus } from "@/domain/trade/order/availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import {
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
	switchMarginMode: (mode: MarginMode) => Promise<void>;
	applyMarginAndLeverage: (mode: MarginMode, leverageValue: number) => Promise<void>;
	isSwitchingMode: boolean;
	switchModeError: Error | null;
	isOnlyIsolated: boolean;
	allowsCrossMargin: boolean;
}

function getDefaultLeverage(maxLeverage: number): number {
	return Math.min(10, maxLeverage);
}

export function useAssetLeverage(): UseAssetLeverageReturn {
	const { address, isConnected } = useWalletSession();
	const { data: market } = useSelectedMarketInfo();

	const storedMarginMode = useMarginMode();
	const { setMarginMode: setStoredMarginMode } = useGlobalSettingsActions();

	const capabilities = getMarketCapabilities(market);
	const { isOnlyIsolated, allowsCrossMargin } = capabilities;
	const isPerpMarket = market?.kind === "perp" || market?.kind === "builderPerp";

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

	const { mutateAsync: updateLeverage, isPending, error, reset: resetMutation } = useExchange("updateLeverage");

	const operationTypeRef = useRef<OperationType>(null);
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

	const hasPosition = baseToken ? userPositions.hasPosition(baseToken) : false;

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

	const displayLeverage = pendingLeverage ?? currentLeverage;
	const isDirty = pendingLeverage !== null && pendingLeverage !== currentLeverage;

	// biome-ignore lint/correctness/useExhaustiveDependencies: baseToken change triggers reset
	useEffect(() => {
		setPendingLeverageState(null);
		operationTypeRef.current = null;
		resetMutation();
	}, [baseToken, resetMutation]);

	function setPendingLeverage(value: number) {
		const clamped = Math.max(1, Math.min(value, maxLeverage));
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
	}

	function resetPending() {
		setPendingLeverageState(null);
		operationTypeRef.current = null;
		resetMutation();
	}

	async function confirmLeverage() {
		if (!isPerpMarket || pendingLeverage === null || typeof assetId !== "number") {
			return;
		}
		assertIsolatedRiskIncreaseAllowed(marginMode);

		operationTypeRef.current = "leverage";
		await updateLeverage({
			asset: assetId,
			isCross: marginMode === "cross",
			leverage: pendingLeverage,
		});

		setPendingLeverageState(null);
	}

	async function switchMarginMode(mode: MarginMode) {
		if (!isPerpMarket || typeof assetId !== "number") return;
		assertIsolatedRiskIncreaseAllowed(mode);

		if (isOnlyIsolated && mode === "cross") {
			throw new Error("This market only supports isolated margin mode");
		}

		if (!isConnected) {
			setStoredMarginMode(mode);
			return;
		}

		if (mode === "isolated" && marginMode === "cross" && hasPosition) {
			throw new Error("Cannot switch to isolated mode with an open position");
		}

		operationTypeRef.current = "mode";
		await updateLeverage({
			asset: assetId,
			isCross: mode === "cross",
			leverage: currentLeverage,
		});

		setStoredMarginMode(mode);
	}

	async function applyMarginAndLeverage(mode: MarginMode, leverageValue: number) {
		if (!isPerpMarket || typeof assetId !== "number") return;
		assertIsolatedRiskIncreaseAllowed(mode);

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

		if (mode === "isolated" && marginMode === "cross" && hasPosition) {
			throw new Error("Cannot switch to isolated mode with an open position");
		}

		operationTypeRef.current = "mode";
		await updateLeverage({
			asset: assetId,
			isCross: mode === "cross",
			leverage: clamped,
		});

		setStoredMarginMode(mode);
		setPendingLeverageState(null);
	}

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
		switchMarginMode,
		applyMarginAndLeverage,
		isSwitchingMode,
		switchModeError,
		isOnlyIsolated,
		allowsCrossMargin,
	};
}
