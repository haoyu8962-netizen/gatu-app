import { Button, Checkbox, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { DataPendingState } from "@/components/ui/data-pending-state";
import { InfoRow } from "@/components/ui/info-row";
import { NumberInput } from "@/components/ui/number-input";
import { DEFAULT_QUOTE_TOKEN, HL_ALL_DEXS } from "@/config/app";
import { getMarketQuoteToken } from "@/domain/trade/balances";
import { isLiveMarkPriceReady } from "@/domain/trade/market-price";
import {
	buildPositionTpSlUpdatePlan,
	hasPositionTpSlTriggerMutation,
	type PositionTpSlExecutionMode,
} from "@/domain/trade/order-intent";
import { doesOrderBatchMatchRiskContext } from "@/domain/trade/order-risk-context";
import {
	createClientOrderId,
	isAmbiguousExchangeRequestError,
	isApiOrderResponseError,
	isOrderBatchResolutionError,
	resolveOrderBatchResponse,
} from "@/domain/trade/order-tracking";
import { useTrackedOrder } from "@/hooks/trade/use-tracked-order";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import {
	formatPercent,
	formatPrice,
	formatQuoteAmount,
	formatToken,
	formatUSD,
	szDecimalsToPriceDecimals,
} from "@/lib/format";
import {
	type ExchangeParams,
	type Position,
	useExchange,
	useHyperliquid,
	useMarkets,
	useMarketsInfo,
	useSubscription,
	useUserPositions,
} from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { toBig } from "@/lib/trade/numbers";
import {
	areTpSlOrderInfosEqual,
	buildTpSlOrdersByCoin,
	type OpenOrder,
	type TpSlOrderInfo,
} from "@/lib/trade/open-orders";
import {
	getOrderAssetReservationState,
	reserveOrderAssets,
	runWithAvailableOrderAssetLocks,
} from "@/lib/trade/order-asset-lock";
import {
	calculateEstimatedPnlExact,
	calculateRoeMagnitudeFromPriceExact,
	calculateSlPriceFromRoe,
	calculateTargetPriceFromPnl,
	calculateTpPriceFromRoe,
	validatePositionSlPrice,
	validateSlPrice,
	validateTpPrice,
} from "@/lib/trade/tpsl";
import { getValueColorClass } from "@/lib/ui/value-color";
import { AssetDisplay } from "../components/asset-display";
import { TradingActionButton } from "../components/trading-action-button";
import { TpSlSection } from "../tradebox/tp-sl-section";
import type { TpSlPositionTarget } from "./position-dialog-types";
import { PositionRiskDialogShell } from "./position-risk-dialog-ui";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	position: TpSlPositionTarget | null;
}

export function PositionTpSlModal({ open, onOpenChange, position }: Props) {
	const isMobile = useIsMobile();
	if (!position) return null;
	return (
		<PositionTpSlModalBody
			key={`${position.owner}:${position.env}:${position.dex}:${position.assetId}:${open ? "open" : "closed"}`}
			open={open}
			position={position}
			isMobile={isMobile}
			onOpenChange={onOpenChange}
		/>
	);
}

interface BodyProps {
	open: boolean;
	position: TpSlPositionTarget;
	isMobile: boolean;
	onOpenChange: (open: boolean) => void;
}

interface PositionTpSlSessionIdentity {
	owner: string;
	env: "Mainnet" | "Testnet";
}

interface PositionTpSlLiveExecutionContext {
	clientKey: string;
	env: "Mainnet" | "Testnet";
	walletOwner: string | null;
	markPx: string | null;
	markCoin: string | undefined;
	markStatus: "idle" | "subscribing" | "active" | "error";
	markIsStale: boolean;
	markReceivedAt: number | undefined;
	hasMarkSnapshot: boolean;
	markets: ReturnType<typeof useMarkets>;
	userPositions: ReturnType<typeof useUserPositions>;
	openOrdersStatus: "idle" | "subscribing" | "active" | "error";
	openOrdersIsStale: boolean;
	hasOpenOrdersSnapshot: boolean;
	openOrders: readonly OpenOrder[];
}

type PositionTpSlCancelResolution =
	| { status: "accepted"; errors: string[] }
	| { status: "partial"; errors: string[] }
	| { status: "rejected"; errors: string[] };

class PositionTpSlMutationResponseError extends Error {
	readonly uncertain: boolean;

	constructor(message: string, uncertain: boolean) {
		super(message);
		this.name = "PositionTpSlMutationResponseError";
		this.uncertain = uncertain;
	}
}

class PositionTpSlFreshStateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PositionTpSlFreshStateError";
	}
}

function applyCompletedTpSlCancels(
	snapshot: TpSlOrderInfo | undefined,
	cancels: readonly ExchangeParams<"cancel">["cancels"][number][],
): TpSlOrderInfo | undefined | null {
	let next = snapshot ? { ...snapshot } : undefined;
	for (const cancel of cancels) {
		if (next?.tpOrderId === cancel.o) {
			const {
				tpPrice: _tpPrice,
				tpOrderId: _tpOrderId,
				tpSize: _tpSize,
				tpIsMarket: _tpIsMarket,
				tpLimitPrice: _tpLimitPrice,
				tpSide: _tpSide,
				...rest
			} = next;
			next = Object.keys(rest).length > 0 ? rest : undefined;
		} else if (next?.slOrderId === cancel.o) {
			const {
				slPrice: _slPrice,
				slOrderId: _slOrderId,
				slSize: _slSize,
				slIsMarket: _slIsMarket,
				slLimitPrice: _slLimitPrice,
				slSide: _slSide,
				...rest
			} = next;
			next = Object.keys(rest).length > 0 ? rest : undefined;
		} else {
			return null;
		}
	}
	return next;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getCancelStatusError(status: unknown): string | null {
	return isUnknownRecord(status) && typeof status.error === "string" ? status.error : null;
}

function resolvePositionTpSlCancelResponse(
	response: unknown,
	expectedCount: number,
): PositionTpSlCancelResolution | null {
	if (!Number.isSafeInteger(expectedCount) || expectedCount <= 0 || !isUnknownRecord(response)) return null;
	if (response.status === "err" && typeof response.response === "string") {
		return { status: "rejected", errors: [response.response] };
	}
	if (response.status !== "ok" || !isUnknownRecord(response.response) || response.response.type !== "cancel") {
		return null;
	}
	const data = response.response.data;
	if (!isUnknownRecord(data) || !Array.isArray(data.statuses)) return null;
	const statuses = data.statuses;
	if (statuses.length === 1 && expectedCount > 1) {
		const error = getCancelStatusError(statuses[0]);
		return error ? { status: "rejected", errors: [error] } : null;
	}
	if (statuses.length !== expectedCount) return null;

	const errors: string[] = [];
	let successCount = 0;
	for (let index = 0; index < statuses.length; index += 1) {
		const status = statuses[index];
		if (status === "success") {
			successCount += 1;
			continue;
		}
		const error = getCancelStatusError(status);
		if (!error) return null;
		errors.push(error);
	}
	if (successCount === expectedCount) return { status: "accepted", errors };
	if (successCount === 0) return { status: "rejected", errors };
	return { status: "partial", errors };
}

function PositionTpSlModalBody({ open, position, isMobile, onOpenChange }: BodyProps) {
	const { address, isConnected } = useWalletSession();
	const { clientKey, env, info } = useHyperliquid();
	const sessionIdentity = useRef<PositionTpSlSessionIdentity>({
		owner: position.owner.toLowerCase(),
		env: position.env,
	}).current;
	const userPositions = useUserPositions();
	const markets = useMarkets();
	const { getPosition, isLoading: positionLoading, hasError: positionError, isStale: positionStale } = userPositions;
	const activeOwner = clientKey === "disconnected" ? null : clientKey.toLowerCase();
	const walletOwner = address?.toLowerCase() ?? null;
	const identityMatches =
		activeOwner === sessionIdentity.owner && walletOwner === sessionIdentity.owner && env === sessionIdentity.env;
	const { getMarketInfo } = useMarketsInfo();
	const currentMarket = markets.getMarket(position.coin);
	const quoteSymbol = getMarketQuoteToken(currentMarket);
	const currentMarketDex = currentMarket?.kind === "builderPerp" ? currentMarket.dex : "";
	const marketBindingReady =
		!markets.isLoading &&
		markets.error === null &&
		currentMarket !== undefined &&
		currentMarket.kind !== "spot" &&
		currentMarket.assetId === position.assetId &&
		currentMarket.szDecimals === position.szDecimals &&
		currentMarketDex === position.dex;
	const currentPosition = getPosition(position.coin, position.dex);
	const marketMarkPx = getMarketInfo(position.coin)?.markPx;
	const {
		data: liveAssetCtx,
		status: markStatus,
		isStale: markIsStale,
		lastMessageAt: markReceivedAt,
	} = useSubscription("activeAssetCtx", { coin: position.coin }, { enabled: open });
	const activeMarkPx = liveAssetCtx?.ctx?.markPx ?? null;
	const displayMarkPx = activeMarkPx ?? marketMarkPx ?? null;
	const hasMarkSnapshot = liveAssetCtx?.coin === position.coin;
	const markSnapshotReady =
		hasMarkSnapshot &&
		isLiveMarkPriceReady(
			markStatus === "error" ? "error" : markStatus === "active" && !markIsStale ? "success" : "loading",
			activeMarkPx ?? undefined,
			markReceivedAt,
		);
	const {
		data: openOrdersEvent,
		status: openOrdersStatus,
		isStale: openOrdersIsStale,
	} = useSubscription(
		"openOrders",
		{ user: sessionIdentity.owner, dex: HL_ALL_DEXS },
		{ enabled: open && isConnected && identityMatches },
	);
	const openOrders = openOrdersEvent?.orders ?? [];
	const currentTpSlInfo = buildTpSlOrdersByCoin(openOrders).get(position.coin);
	const currentPositionSize = toBig(currentPosition?.szi);
	const hasOpenOrdersSnapshot = openOrdersEvent !== undefined;
	const executionStateRef = useRef<PositionTpSlLiveExecutionContext>({
		clientKey,
		env,
		walletOwner,
		markPx: activeMarkPx,
		markCoin: liveAssetCtx?.coin,
		markStatus,
		markIsStale,
		markReceivedAt,
		hasMarkSnapshot,
		markets,
		userPositions,
		openOrdersStatus,
		openOrdersIsStale,
		hasOpenOrdersSnapshot,
		openOrders,
	});
	executionStateRef.current = {
		clientKey,
		env,
		walletOwner,
		markPx: activeMarkPx,
		markCoin: liveAssetCtx?.coin,
		markStatus,
		markIsStale,
		markReceivedAt,
		hasMarkSnapshot,
		markets,
		userPositions,
		openOrdersStatus,
		openOrdersIsStale,
		hasOpenOrdersSnapshot,
		openOrders,
	};

	if (!isConnected || !address) {
		return (
			<PositionTpSlStatus
				open={open}
				isMobile={isMobile}
				position={position}
				message={t`Connect wallet to view positions`}
				onClose={onOpenChange}
			/>
		);
	}
	if (!identityMatches) {
		return (
			<PositionTpSlStatus
				open={open}
				isMobile={isMobile}
				position={position}
				message={t`Trading data changed while this dialog was open. Close and reopen it before submitting.`}
				onClose={onOpenChange}
			/>
		);
	}
	if (((positionLoading || positionError || positionStale) && !currentPosition) || !hasOpenOrdersSnapshot) {
		return (
			<PositionTpSlStatus
				open={open}
				isMobile={isMobile}
				position={position}
				loading={positionLoading || openOrdersStatus === "subscribing" || openOrdersStatus === "idle"}
				onClose={onOpenChange}
			/>
		);
	}
	if (!currentPosition || !currentPositionSize || currentPositionSize.eq(0)) {
		return (
			<PositionTpSlStatus
				open={open}
				isMobile={isMobile}
				position={position}
				message={t`No active positions.`}
				onClose={onOpenChange}
			/>
		);
	}
	const liveDataReady =
		identityMatches &&
		!positionLoading &&
		!positionError &&
		!positionStale &&
		marketBindingReady &&
		openOrdersStatus === "active" &&
		!openOrdersIsStale &&
		hasOpenOrdersSnapshot;
	const liveDataMessage =
		!markets.isLoading && !markets.error && !marketBindingReady
			? t`Trading data changed while this dialog was open. Close and reopen it before submitting.`
			: null;

	return (
		<PositionTpSlForm
			open={open}
			isMobile={isMobile}
			positionRef={position}
			position={currentPosition}
			markPx={displayMarkPx}
			markSnapshotReady={markSnapshotReady}
			currentTpSlInfo={currentTpSlInfo}
			quoteSymbol={quoteSymbol}
			sessionIdentity={sessionIdentity}
			executionStateRef={executionStateRef}
			infoClient={info}
			liveDataReady={liveDataReady}
			liveDataMessage={liveDataMessage}
			onOpenChange={onOpenChange}
		/>
	);
}

interface FormProps {
	open: boolean;
	isMobile: boolean;
	positionRef: TpSlPositionTarget;
	position: Position;
	markPx: string | null;
	markSnapshotReady: boolean;
	currentTpSlInfo: TpSlOrderInfo | undefined;
	quoteSymbol: string;
	sessionIdentity: PositionTpSlSessionIdentity;
	executionStateRef: { current: PositionTpSlLiveExecutionContext };
	infoClient: ReturnType<typeof useHyperliquid>["info"];
	liveDataReady: boolean;
	liveDataMessage: string | null;
	onOpenChange: (open: boolean) => void;
}

function PositionTpSlForm({
	open,
	isMobile,
	positionRef,
	position,
	markPx,
	markSnapshotReady,
	currentTpSlInfo,
	quoteSymbol,
	sessionIdentity,
	executionStateRef,
	infoClient,
	liveDataReady,
	liveDataMessage,
	onOpenChange,
}: FormProps) {
	useNumberFormatRevision();
	const decimals = szDecimalsToPriceDecimals(positionRef.szDecimals);
	const liveSignedSize = toBig(position.szi);
	const [signedSize] = useState(() => toBig(position.szi));
	const isLong = signedSize?.gt(0) ?? false;
	const size = signedSize?.abs().toString() ?? "0";
	const entryPx = position.entryPx;
	const unrealizedPnl = position.unrealizedPnl;
	const roe = position.returnOnEquity;
	const leverage = position.leverage.value;
	const side = isLong ? "buy" : "sell";
	const [initialTpSlInfo] = useState<TpSlOrderInfo | undefined>(() =>
		currentTpSlInfo ? { ...currentTpSlInfo } : undefined,
	);
	const initialConfiguredSize = initialTpSlInfo?.tpSize ?? initialTpSlInfo?.slSize;
	const initialUsesPartialSize = toBig(initialConfiguredSize)?.gt(0) ?? false;
	const initialExecutionMode: PositionTpSlExecutionMode =
		initialTpSlInfo?.tpIsMarket === false || initialTpSlInfo?.slIsMarket === false ? "limit" : "market";
	const [tpPriceInput, setTpPriceInput] = useState(() => toBig(initialTpSlInfo?.tpPrice)?.toFixed(decimals) ?? "");
	const [slPriceInput, setSlPriceInput] = useState(() => toBig(initialTpSlInfo?.slPrice)?.toFixed(decimals) ?? "");
	const [configureAmount, setConfigureAmount] = useState(initialUsesPartialSize);
	const [sizeInput, setSizeInput] = useState(
		() => toBig(initialUsesPartialSize ? initialConfiguredSize : size)?.toFixed(positionRef.szDecimals, 0) ?? "",
	);
	const [executionMode, setExecutionMode] = useState<PositionTpSlExecutionMode>(initialExecutionMode);
	const [tpLimitPriceInput, setTpLimitPriceInput] = useState(() =>
		initialTpSlInfo?.tpIsMarket === false ? (toBig(initialTpSlInfo.tpLimitPrice)?.toFixed(decimals) ?? "") : "",
	);
	const [slLimitPriceInput, setSlLimitPriceInput] = useState(() =>
		initialTpSlInfo?.slIsMarket === false ? (toBig(initialTpSlInfo.slLimitPrice)?.toFixed(decimals) ?? "") : "",
	);
	const [returnUnit, setReturnUnit] = useState<"pnl" | "roe">("roe");
	const [tpReturnDraft, setTpReturnDraft] = useState<string | null>(null);
	const [slReturnDraft, setSlReturnDraft] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [requiresRefresh, setRequiresRefresh] = useState(false);
	const allowedTpSlSnapshotsRef = useRef<Array<TpSlOrderInfo | undefined>>([initialTpSlInfo]);
	const expectedTpSlSnapshotRef = useRef<TpSlOrderInfo | undefined>(initialTpSlInfo);
	const workflowSubmittingRef = useRef(false);
	const [isWorkflowSubmitting, setIsWorkflowSubmitting] = useState(false);

	function appendAllowedTpSlSnapshot(snapshot: TpSlOrderInfo | undefined): void {
		expectedTpSlSnapshotRef.current = snapshot;
		if (allowedTpSlSnapshotsRef.current.some((allowed) => areTpSlOrderInfosEqual(allowed, snapshot))) return;
		allowedTpSlSnapshotsRef.current = [...allowedTpSlSnapshotsRef.current, snapshot];
	}

	function recordCompletedCancels(cancels: readonly ExchangeParams<"cancel">["cancels"][number][]): boolean {
		const next = applyCompletedTpSlCancels(expectedTpSlSnapshotRef.current, cancels);
		if (next === null) return false;
		appendAllowedTpSlSnapshot(next);
		return true;
	}

	function assertLiveExecutionContext() {
		const current = executionStateRef.current;
		if (
			current.clientKey === "disconnected" ||
			current.clientKey.toLowerCase() !== sessionIdentity.owner ||
			current.walletOwner !== sessionIdentity.owner ||
			current.env !== sessionIdentity.env ||
			current.userPositions.isLoading ||
			current.userPositions.hasError ||
			current.userPositions.isStale ||
			current.markets.isLoading ||
			current.markets.error !== null ||
			current.openOrdersStatus !== "active" ||
			current.openOrdersIsStale ||
			!current.hasOpenOrdersSnapshot
		) {
			throw new PositionTpSlFreshStateError(
				t`Trading data changed while this dialog was open. Close and reopen it before submitting.`,
			);
		}

		const currentPosition = current.userPositions.getPosition(positionRef.coin, positionRef.dex);
		const currentSize = toBig(currentPosition?.szi);
		if (
			!currentPosition ||
			!signedSize ||
			!currentSize ||
			currentSize.eq(0) ||
			!currentSize.eq(signedSize) ||
			currentSize.gt(0) !== positionRef.isLong ||
			currentPosition.leverage.type !== positionRef.marginMode
		) {
			throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
		}
		const currentMarket = current.markets.getMarket(positionRef.coin);
		const currentDex = currentMarket?.kind === "builderPerp" ? currentMarket.dex : "";
		if (
			!currentMarket ||
			currentMarket.kind === "spot" ||
			currentMarket.assetId !== positionRef.assetId ||
			currentMarket.szDecimals !== positionRef.szDecimals ||
			currentDex !== positionRef.dex
		) {
			throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
		}
		const liveTpSlInfo = buildTpSlOrdersByCoin(current.openOrders).get(positionRef.coin);
		// The stream may lag behind a multi-request workflow, but it must match the initial
		// snapshot or one of the exact successful prefixes recorded from exchange responses.
		if (!allowedTpSlSnapshotsRef.current.some((allowed) => areTpSlOrderInfosEqual(allowed, liveTpSlInfo))) {
			throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
		}
		return { position: currentPosition, size: currentSize.abs() };
	}

	async function assertFreshWorkflowContext(
		orders: readonly ExchangeParams<"order">["orders"][number][],
	): Promise<void> {
		assertLiveExecutionContext();
		const user = sessionIdentity.owner as `0x${string}`;
		const [freshOrders, freshClearinghouseState] = await Promise.all([
			infoClient.frontendOpenOrders({ user, dex: positionRef.dex }),
			infoClient.clearinghouseState({ user, dex: positionRef.dex }),
		]);
		assertLiveExecutionContext();

		const freshPosition = freshClearinghouseState.assetPositions.find(
			(entry) => entry.position.coin === positionRef.coin,
		)?.position;
		const freshSize = toBig(freshPosition?.szi);
		if (
			!freshPosition ||
			!signedSize ||
			!freshSize ||
			freshSize.eq(0) ||
			!freshSize.eq(signedSize) ||
			freshSize.gt(0) !== positionRef.isLong ||
			freshPosition.leverage.type !== positionRef.marginMode ||
			orders.some((order) => {
				const orderSize = toBig(order.s);
				return !orderSize || orderSize.lt(0) || (orderSize.gt(0) && orderSize.gt(freshSize.abs()));
			})
		) {
			throw new PositionTpSlFreshStateError(
				t`Trading data changed while this dialog was open. Close and reopen it before submitting.`,
			);
		}

		const freshTpSlInfo = buildTpSlOrdersByCoin(freshOrders).get(positionRef.coin);
		if (!areTpSlOrderInfosEqual(expectedTpSlSnapshotRef.current, freshTpSlInfo)) {
			throw new PositionTpSlFreshStateError(
				t`Trading data changed while this dialog was open. Close and reopen it before submitting.`,
			);
		}
	}

	function assertCompleteOrderResponse(response: unknown, expectedCount: number): void {
		const resolution = resolveOrderBatchResponse(response, expectedCount);
		if (resolution?.status === "accepted") return;
		const uncertain = resolution === null || resolution?.status === "partial";
		const message = resolution?.errors.join("; ") || t`Order submitted. Confirming exchange status; do not retry.`;
		throw new PositionTpSlMutationResponseError(message, uncertain);
	}

	function assertCompleteCancelResponse(response: unknown, expectedCount: number): void {
		const resolution = resolvePositionTpSlCancelResponse(response, expectedCount);
		if (resolution?.status === "accepted") return;
		const uncertain = resolution === null || resolution.status === "partial";
		const message = resolution?.errors.join("; ") || t`Order submitted. Confirming exchange status; do not retry.`;
		throw new PositionTpSlMutationResponseError(message, uncertain);
	}

	function assertOrdersMatchPosition(orders: readonly ExchangeParams<"order">["orders"][number][]): void {
		const live = assertLiveExecutionContext();
		const execution = executionStateRef.current;
		if (
			!execution.hasMarkSnapshot ||
			execution.markCoin !== position.coin ||
			!isLiveMarkPriceReady(
				execution.markStatus === "error"
					? "error"
					: execution.markStatus === "active" && !execution.markIsStale
						? "success"
						: "loading",
				execution.markPx ?? undefined,
				execution.markReceivedAt,
			)
		) {
			throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
		}
		const liveMarkPrice = toBig(execution.markPx);
		const hasInvalidOrder = orders.some((order) => {
			const orderSize = toBig(order.s);
			const triggerPrice = "trigger" in order.t ? order.t.trigger.triggerPx : null;
			const normalizedTriggerPrice = toBig(triggerPrice);
			const normalizedOrderPrice = toBig(order.p);
			const liveSide = positionRef.isLong ? "buy" : "sell";
			const triggerIsInvalid =
				!(liveMarkPrice?.gt(0) ?? false) ||
				!("trigger" in order.t) ||
				(order.t.trigger.tpsl === "tp"
					? !validateTpPrice(liveMarkPrice, triggerPrice, liveSide)
					: !validatePositionSlPrice(liveMarkPrice, live.position.liquidationPx, triggerPrice, liveSide));
			const orderPriceIsInvalid =
				!normalizedTriggerPrice?.gt(0) ||
				!normalizedOrderPrice?.gt(0) ||
				(order.b ? normalizedOrderPrice.lt(normalizedTriggerPrice) : normalizedOrderPrice.gt(normalizedTriggerPrice));
			return (
				order.a !== positionRef.assetId ||
				order.b === positionRef.isLong ||
				!order.r ||
				!("trigger" in order.t) ||
				!orderSize ||
				orderSize.lt(0) ||
				(orderSize.gt(0) && orderSize.gt(live.size)) ||
				triggerIsInvalid ||
				orderPriceIsInvalid
			);
		});
		if (hasInvalidOrder) {
			throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
		}
	}

	function assertOrderExecution(params: ExchangeParams<"order">): void {
		assertOrdersMatchPosition(params.orders);
		if (params.grouping !== "positionTpsl") {
			throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
		}
	}

	function assertCancelExecution(params: ExchangeParams<"cancel">): void {
		assertLiveExecutionContext();
		if (params.cancels.some((cancel) => cancel.a !== positionRef.assetId)) {
			throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
		}
	}

	const {
		submitOrder,
		isPending: isPlacing,
		error: placeError,
	} = useTrackedOrder({
		executionGuard: assertOrderExecution,
	});
	const {
		mutateAsync: cancelOrders,
		isPending: isCancelling,
		error: cancelError,
	} = useExchange("cancel", {
		executionGuard: assertCancelExecution,
	});
	const isSubmitting = isWorkflowSubmitting || isPlacing || isCancelling;

	const positionChanged =
		!liveSignedSize ||
		!signedSize ||
		!liveSignedSize.eq(signedSize) ||
		isLong !== positionRef.isLong ||
		position.leverage.type !== positionRef.marginMode;
	const ordersChanged = !areTpSlOrderInfosEqual(initialTpSlInfo, currentTpSlInfo);
	const expectedCloseSide = isLong ? "A" : "B";
	const positionSideConflict = Boolean(
		(initialTpSlInfo?.tpSide && initialTpSlInfo.tpSide !== expectedCloseSide) ||
			(initialTpSlInfo?.slSide && initialTpSlInfo.slSide !== expectedCloseSide),
	);
	const configurationConflict = Boolean(
		initialTpSlInfo?.ambiguous || initialTpSlInfo?.incompatible || positionSideConflict,
	);

	const partialSizeValue = toBig(sizeInput);
	const liveSizeValue = toBig(size);
	const partialSizeValid =
		!configureAmount ||
		(Boolean(partialSizeValue?.gt(0)) && Boolean(liveSizeValue && partialSizeValue?.lte(liveSizeValue)));
	const effectiveOrderSize = configureAmount && partialSizeValue?.gt(0) ? partialSizeValue.toString() : size;
	const isLimitExecution = executionMode === "limit";

	function calculatePriceFromLinkedReturn(type: "tp" | "sl", value: string): string | null {
		return returnUnit === "roe"
			? type === "tp"
				? calculateTpPriceFromRoe(entryPx, side, value, leverage, decimals)
				: calculateSlPriceFromRoe(entryPx, side, value, leverage, decimals)
			: calculateTargetPriceFromPnl(entryPx, side, effectiveOrderSize, value, type, decimals);
	}

	function resolvePriceInput(type: "tp" | "sl", draft: string | null, fallback: string): string {
		if (draft === null) return fallback;
		if (draft === "") return "";
		return calculatePriceFromLinkedReturn(type, draft) ?? "";
	}

	const effectiveTpPriceInput = resolvePriceInput("tp", tpReturnDraft, tpPriceInput);
	const effectiveSlPriceInput = resolvePriceInput("sl", slReturnDraft, slPriceInput);
	const tpPriceValue = toBig(effectiveTpPriceInput);
	const slPriceValue = toBig(effectiveSlPriceInput);
	const tpPriceInputPresent = effectiveTpPriceInput.trim() !== "";
	const slPriceInputPresent = effectiveSlPriceInput.trim() !== "";
	const tpPriceInputValid = !tpPriceInputPresent || (tpPriceValue?.gt(0) ?? false);
	const slPriceInputValid = !slPriceInputPresent || (slPriceValue?.gt(0) ?? false);
	const hasTp = tpPriceInputPresent && tpPriceInputValid;
	const hasSl = slPriceInputPresent && slPriceInputValid;

	function isLimitPriceValid(triggerPrice: string, limitPrice: string): boolean {
		const trigger = toBig(triggerPrice);
		const limit = toBig(limitPrice);
		if (!trigger?.gt(0) || !limit?.gt(0)) return false;
		return isLong ? limit.lte(trigger) : limit.gte(trigger);
	}

	const tpLimitValid = !isLimitExecution || !hasTp || isLimitPriceValid(effectiveTpPriceInput, tpLimitPriceInput);
	const slLimitValid = !isLimitExecution || !hasSl || isLimitPriceValid(effectiveSlPriceInput, slLimitPriceInput);

	function isLinkedReturnDraftInvalid(type: "tp" | "sl", draft: string | null): boolean {
		return draft !== null && draft !== "" && calculatePriceFromLinkedReturn(type, draft) === null;
	}

	const tpReturnDraftInvalid = isLinkedReturnDraftInvalid("tp", tpReturnDraft);
	const slReturnDraftInvalid = isLinkedReturnDraftInvalid("sl", slReturnDraft);
	const updatePlan = buildPositionTpSlUpdatePlan({
		kind: "positionTpsl",
		assetId: positionRef.assetId,
		szDecimals: positionRef.szDecimals,
		isLong,
		tpPriceNum: hasTp ? effectiveTpPriceInput : null,
		slPriceNum: hasSl ? effectiveSlPriceInput : null,
		sizeNum: configureAmount ? sizeInput : null,
		executionMode,
		tpLimitPriceNum: isLimitExecution && hasTp ? tpLimitPriceInput : null,
		slLimitPriceNum: isLimitExecution && hasSl ? slLimitPriceInput : null,
		existingTpPrice: currentTpSlInfo?.tpPrice,
		existingSlPrice: currentTpSlInfo?.slPrice,
		existingTpOrderId: currentTpSlInfo?.tpOrderId,
		existingSlOrderId: currentTpSlInfo?.slOrderId,
		existingTpSize: currentTpSlInfo?.tpSize,
		existingSlSize: currentTpSlInfo?.slSize,
		existingTpIsMarket: currentTpSlInfo?.tpIsMarket,
		existingSlIsMarket: currentTpSlInfo?.slIsMarket,
		existingTpLimitPrice: currentTpSlInfo?.tpLimitPrice,
		existingSlLimitPrice: currentTpSlInfo?.slLimitPrice,
	});
	const tpNeedsMark = hasPositionTpSlTriggerMutation(updatePlan, "tp");
	const slNeedsMark = hasPositionTpSlTriggerMutation(updatePlan, "sl");
	const changedOrders = [...updatePlan.modifies.map((modify) => modify.order), ...updatePlan.orders];
	const normalizedTpTrigger = changedOrders.find((order) => "trigger" in order.t && order.t.trigger.tpsl === "tp")?.t;
	const normalizedSlTrigger = changedOrders.find((order) => "trigger" in order.t && order.t.trigger.tpsl === "sl")?.t;
	const tpValidationPrice =
		normalizedTpTrigger && "trigger" in normalizedTpTrigger
			? normalizedTpTrigger.trigger.triggerPx
			: effectiveTpPriceInput;
	const slValidationPrice =
		normalizedSlTrigger && "trigger" in normalizedSlTrigger
			? normalizedSlTrigger.trigger.triggerPx
			: effectiveSlPriceInput;
	const tpDisplayPrice = tpReturnDraft === null ? effectiveTpPriceInput : String(tpValidationPrice);
	const slDisplayPrice = slReturnDraft === null ? effectiveSlPriceInput : String(slValidationPrice);
	const markReady = markSnapshotReady && (toBig(markPx)?.gt(0) ?? false);
	const tpValid = !tpNeedsMark || (markReady && validateTpPrice(markPx, tpValidationPrice, side));
	const slMarkValid = !slNeedsMark || (markReady && validateSlPrice(markPx, slValidationPrice, side));
	const slValid =
		!slNeedsMark || (markReady && validatePositionSlPrice(markPx, position.liquidationPx, slValidationPrice, side));
	const dataChanged = positionChanged || ordersChanged;
	const canSubmit =
		updatePlan.hasChanges &&
		updatePlan.errors.length === 0 &&
		tpValid &&
		slValid &&
		partialSizeValid &&
		tpPriceInputValid &&
		slPriceInputValid &&
		tpLimitValid &&
		slLimitValid &&
		!tpReturnDraftInvalid &&
		!slReturnDraftInvalid &&
		!configurationConflict &&
		!dataChanged &&
		!requiresRefresh &&
		liveDataReady &&
		!isSubmitting;

	let tpError: string | null = null;
	if (tpReturnDraftInvalid || !tpPriceInputValid) {
		tpError = t`Enter a valid TP/SL order configuration.`;
	} else if (tpNeedsMark && markReady && !tpValid) {
		tpError = isLong ? t`Take profit trigger must be above mark` : t`Take profit trigger must be below mark`;
	}
	let slError: string | null = null;
	if (slReturnDraftInvalid || !slPriceInputValid) {
		slError = t`Enter a valid TP/SL order configuration.`;
	} else if (slNeedsMark && markReady && !slValid) {
		if (!slMarkValid || !toBig(position.liquidationPx)?.gt(0)) {
			slError = isLong ? t`Stop trigger must be below mark` : t`Stop trigger must be above mark`;
		} else {
			slError = isLong
				? t`Stop trigger must be above liquidation price`
				: t`Stop trigger must be below liquidation price`;
		}
	}
	let sizeError: string | null = null;
	if (configureAmount && !partialSizeValid) {
		sizeError = t`Amount must be greater than zero and no more than the current position.`;
	}
	let tpLimitError: string | null = null;
	if (isLimitExecution && hasTp && !tpLimitValid) {
		tpLimitError = isLong
			? t`Take profit limit must be at or below its trigger.`
			: t`Take profit limit must be at or above its trigger.`;
	}
	let slLimitError: string | null = null;
	if (isLimitExecution && hasSl && !slLimitValid) {
		slLimitError = isLong
			? t`Stop loss limit must be at or below its trigger.`
			: t`Stop loss limit must be at or above its trigger.`;
	}
	const planError =
		updatePlan.errors.length > 0 && !sizeError && !tpLimitError && !slLimitError
			? t`Enter a valid TP/SL order configuration.`
			: null;

	function formatLinkedReturn(value: string | null, fractionDigits: number): string {
		const parsed = toBig(value)?.abs();
		return parsed?.gt(0) ? parsed.round(fractionDigits).toString() : "";
	}

	function getLinkedReturnValue(type: "tp" | "sl"): string {
		const draft = type === "tp" ? tpReturnDraft : slReturnDraft;
		if (draft !== null) return draft;
		const targetPrice = type === "tp" ? effectiveTpPriceInput : effectiveSlPriceInput;
		if (returnUnit === "roe") {
			return formatLinkedReturn(calculateRoeMagnitudeFromPriceExact(entryPx, targetPrice, side, type, leverage), 1);
		}
		return formatLinkedReturn(
			calculateEstimatedPnlExact({ referencePrice: entryPx, side, size: effectiveOrderSize }, targetPrice),
			2,
		);
	}

	function handlePriceChange(type: "tp" | "sl", value: string) {
		if (type === "tp") {
			setTpReturnDraft(null);
			setTpPriceInput(value);
		} else {
			setSlReturnDraft(null);
			setSlPriceInput(value);
		}
		setSubmitError(null);
	}

	function handleLinkedReturnChange(type: "tp" | "sl", value: string) {
		if (!/^\d*\.?\d*$/.test(value)) return;
		if (type === "tp") setTpReturnDraft(value);
		else setSlReturnDraft(value);
		setSubmitError(null);
	}

	function handleLinkedReturnBlur(type: "tp" | "sl") {
		const draft = type === "tp" ? tpReturnDraft : slReturnDraft;
		if (isLinkedReturnDraftInvalid(type, draft)) return;
		const price = type === "tp" ? effectiveTpPriceInput : effectiveSlPriceInput;
		if (type === "tp") {
			setTpPriceInput(price);
			setTpReturnDraft(null);
		} else {
			setSlPriceInput(price);
			setSlReturnDraft(null);
		}
	}

	function handleReturnUnitToggle() {
		if (!tpReturnDraftInvalid) setTpPriceInput(effectiveTpPriceInput);
		if (!slReturnDraftInvalid) setSlPriceInput(effectiveSlPriceInput);
		setReturnUnit((current) => (current === "roe" ? "pnl" : "roe"));
		setTpReturnDraft(null);
		setSlReturnDraft(null);
	}

	function handleExecutionModeChange(checked: boolean | "indeterminate") {
		const nextMode: PositionTpSlExecutionMode = checked === true ? "limit" : "market";
		setExecutionMode(nextMode);
		if (nextMode === "limit") {
			if (!toBig(tpLimitPriceInput)?.gt(0) && hasTp) setTpLimitPriceInput(effectiveTpPriceInput);
			if (!toBig(slLimitPriceInput)?.gt(0) && hasSl) setSlLimitPriceInput(effectiveSlPriceInput);
		}
		setSubmitError(null);
	}

	async function handleSubmit() {
		if (!canSubmit || workflowSubmittingRef.current) return;
		workflowSubmittingRef.current = true;
		setIsWorkflowSubmitting(true);

		setSubmitError(null);
		let shouldClose = false;
		try {
			const lockIdentity = {
				env: sessionIdentity.env,
				owner: sessionIdentity.owner,
				assetIds: [positionRef.assetId],
			} as const;
			const reservationIntent = {
				intentKey: `position-tpsl:${positionRef.assetId}`,
				exclusiveAssetLock: true,
				isRiskReducing: true,
			};
			const workflowReservationId = `position-tpsl:${createClientOrderId()}`;
			const lockResult = await runWithAvailableOrderAssetLocks(lockIdentity, async (lease) => {
				const reservationState = getOrderAssetReservationState(lease, reservationIntent);
				if (reservationState === "unavailable") return { state: "coordination-unavailable" } as const;
				if (reservationState === "conflict") return { state: "blocked" } as const;

				let mutationStarted = false;
				let completedMutation = false;
				let activeStep: "place" | "cancel" | null = null;
				let activeExpectedCount = 0;
				try {
					const riskContext = { marketKind: "perp", marginMode: position.leverage.type } as const;
					const replacementCancels = updatePlan.modifies.map((modify) => ({
						a: modify.order.a,
						o: modify.oid,
					}));
					const workflowCancels = [...replacementCancels, ...updatePlan.cancels];
					const workflowOrders = [...updatePlan.modifies.map((modify) => modify.order), ...updatePlan.orders];
					if (!doesOrderBatchMatchRiskContext(workflowOrders, riskContext)) {
						throw new Error(t`Order market context does not match the submitted asset.`);
					}
					await assertFreshWorkflowContext(workflowOrders);

					// Trigger replacement is deliberately cancel-then-place. Hyperliquid's
					// batchModify replacement flag can place even when its cancel fails.
					if (workflowCancels.length > 0) {
						mutationStarted = true;
						activeStep = "cancel";
						activeExpectedCount = workflowCancels.length;
						const result = await cancelOrders({ cancels: workflowCancels });
						assertCompleteCancelResponse(result, activeExpectedCount);
						completedMutation = true;
						if (!recordCompletedCancels(workflowCancels)) {
							throw new PositionTpSlMutationResponseError(
								t`Order submitted. Confirming exchange status; do not retry.`,
								true,
							);
						}
					}
					if (workflowOrders.length > 0) {
						mutationStarted = true;
						activeStep = "place";
						activeExpectedCount = workflowOrders.length;
						const submission = await submitOrder(
							{ orders: workflowOrders, grouping: "positionTpsl" },
							{
								assetLockLease: lease,
								exclusiveAssetLock: true,
								riskContext,
							},
						);
						if (submission.state === "blocked") {
							if (completedMutation) {
								throw new PositionTpSlMutationResponseError(
									t`Order submitted. Confirming exchange status; do not retry.`,
									true,
								);
							}
							return { state: "blocked" } as const;
						}
						if (submission.state === "reconciling") return { state: "uncertain" } as const;
						assertCompleteOrderResponse(submission.result, activeExpectedCount);
						completedMutation = true;
					}
					return { state: "confirmed" } as const;
				} catch (error) {
					const apiResolution =
						activeExpectedCount > 0 && isApiOrderResponseError(error)
							? activeStep === "cancel"
								? resolvePositionTpSlCancelResponse(error.response, activeExpectedCount)
								: resolveOrderBatchResponse(error.response, activeExpectedCount)
							: null;
					const responseUncertain =
						error instanceof PositionTpSlMutationResponseError
							? error.uncertain
							: isOrderBatchResolutionError(error)
								? error.resolution.status === "partial"
								: isApiOrderResponseError(error) &&
									(apiResolution === null || apiResolution.status === "partial" || apiResolution.status === "accepted");
					const uncertain =
						mutationStarted && (completedMutation || isAmbiguousExchangeRequestError(error) || responseUncertain);
					const requiresRefresh = uncertain || error instanceof PositionTpSlFreshStateError;
					if (uncertain) {
						reserveOrderAssets(lease, {
							...reservationIntent,
							submissionId: workflowReservationId,
							createdAt: Date.now(),
						});
					}
					return { state: "failed", error, requiresRefresh, uncertain } as const;
				}
			});

			if (!lockResult.supported) {
				throw new Error(t`Safe action coordination across tabs is unavailable in this browser.`);
			}
			if (!lockResult.acquired || lockResult.value.state === "blocked") {
				setSubmitError(t`Another order for this market is still being confirmed.`);
				return;
			}
			if (lockResult.value.state === "coordination-unavailable") {
				throw new Error(t`Safe action coordination across tabs is unavailable in this browser.`);
			}
			if (lockResult.value.state === "uncertain") {
				setSubmitError(t`Order submitted. Confirming exchange status; do not retry.`);
				setRequiresRefresh(true);
				return;
			}
			if (lockResult.value.state === "failed") {
				const message = lockResult.value.uncertain
					? t`Order submitted. Confirming exchange status; do not retry.`
					: lockResult.value.error instanceof Error
						? lockResult.value.error.message
						: t`Failed to update TP/SL orders`;
				setSubmitError(message);
				if (lockResult.value.requiresRefresh) setRequiresRefresh(true);
				toast.error(message);
				return;
			}
			shouldClose = true;
		} catch (err) {
			const message = err instanceof Error ? err.message : t`Failed to update TP/SL orders`;
			setSubmitError(message);
			toast.error(message);
		} finally {
			workflowSubmittingRef.current = false;
			setIsWorkflowSubmitting(false);
		}
		if (shouldClose) {
			toast.success(t`TP/SL orders updated`);
			onOpenChange(false);
		}
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen && (isSubmitting || workflowSubmittingRef.current)) return;
		onOpenChange(nextOpen);
	}

	let guardMessage: string | null = null;
	if (configurationConflict) {
		guardMessage = t`Existing TP/SL orders use an unsupported mixed or duplicate configuration. Cancel them individually before creating a new pair.`;
	} else if (requiresRefresh || dataChanged) {
		guardMessage = t`Trading data changed while this dialog was open. Close and reopen it before submitting.`;
	} else if (liveDataMessage) {
		guardMessage = liveDataMessage;
	} else if ((tpNeedsMark || slNeedsMark) && !markReady) {
		guardMessage = t`Loading...`;
	}
	const visibleError = submitError ?? placeError?.message ?? cancelError?.message;
	const returnUnitLabel = returnUnit === "roe" ? "%" : quoteSymbol;
	const unrealizedPnlDisplay =
		quoteSymbol === DEFAULT_QUOTE_TOKEN
			? formatUSD(unrealizedPnl, { signDisplay: "exceptZero" })
			: formatQuoteAmount(unrealizedPnl, quoteSymbol, { decimals: 2, signDisplay: "exceptZero" });

	return (
		<PositionRiskDialogShell
			open={open}
			onOpenChange={handleOpenChange}
			isMobile={isMobile}
			dismissible={!isSubmitting}
		>
			{renderPositionHeader(positionRef.coin, isLong)}

			<ModalContent className="max-[1000px]:px-4 max-[1000px]:pt-3 max-[1000px]:pb-0">
				<div className="rounded-[12px] border border-market-close-stroke-card bg-market-close-card p-3 space-y-1 text-xs">
					<InfoRow
						className="p-0"
						label={t`Size`}
						value={`${formatToken(size, positionRef.szDecimals)} ${positionRef.coin}`}
						valueClassName="font-medium"
					/>
					<InfoRow
						className="p-0"
						label={t`Entry Price`}
						value={formatPrice(entryPx, { szDecimals: positionRef.szDecimals })}
						valueClassName="font-medium"
					/>
					<InfoRow
						className="p-0"
						label={t`Mark Price`}
						value={formatPrice(markPx, { szDecimals: positionRef.szDecimals })}
						valueClassName={cn("font-medium", markReady ? "text-warning" : "text-fg-muted")}
					/>
					<InfoRow
						className="p-0"
						label={t`Liquidation Price`}
						value={formatPrice(position.liquidationPx, { szDecimals: positionRef.szDecimals })}
						valueClassName="font-medium"
					/>
					<InfoRow
						className="p-0 border-t border-stroke-weak pt-3"
						label={t`Unrealized P&L`}
						value={
							<>
								{unrealizedPnlDisplay}
								<span className="font-normal text-fg-muted ml-1">({formatPercent(roe, 1)})</span>
							</>
						}
						valueClassName={cn("font-semibold", getValueColorClass(unrealizedPnl))}
					/>
				</div>
			</ModalContent>

			<div className="min-h-0 overflow-y-auto px-4 pb-4 max-[1000px]:pt-4">
				<TpSlSection
					disabled={isSubmitting}
					side={side}
					referencePrice={entryPx}
					size={effectiveOrderSize}
					szDecimals={positionRef.szDecimals}
					tpPrice={tpDisplayPrice}
					slPrice={slDisplayPrice}
					onTpPriceChange={(value) => handlePriceChange("tp", value)}
					onSlPriceChange={(value) => handlePriceChange("sl", value)}
					tpError={tpError}
					slError={slError}
					quickPercentMode="roe"
					leverage={leverage}
					triggerValidationPrice={markPx}
					mobileTouchSafe
					preserveFinancialPrecision
					quoteSymbol={quoteSymbol}
					linkedReturnInputs={{
						unitLabel: returnUnitLabel,
						onUnitToggle: handleReturnUnitToggle,
						tp: {
							ariaLabel: t`Take profit return`,
							placeholder: t`Profit`,
							value: getLinkedReturnValue("tp"),
							onChange: (value) => handleLinkedReturnChange("tp", value),
							onBlur: () => handleLinkedReturnBlur("tp"),
						},
						sl: {
							ariaLabel: t`Stop loss return`,
							placeholder: t`Loss`,
							value: getLinkedReturnValue("sl"),
							onChange: (value) => handleLinkedReturnChange("sl", value),
							onBlur: () => handleLinkedReturnBlur("sl"),
						},
					}}
				/>

				<div className="mt-4 space-y-3 border-t border-market-close-stroke-card pt-4">
					<fieldset
						aria-label={t`TP/SL size scope`}
						className="hidden grid-cols-2 overflow-hidden rounded-[10px] border border-market-close-stroke-card min-[1001px]:grid"
					>
						<button
							type="button"
							aria-pressed={!configureAmount}
							onClick={() => setConfigureAmount(false)}
							disabled={isSubmitting}
							className={cn(
								"min-h-9 px-3 text-xs font-semibold transition-colors duration-150",
								!configureAmount
									? "bg-market-close-control text-market-close-on-control"
									: "bg-modal text-market-close-muted hover:bg-market-close-hover",
							)}
						>
							{t`Whole position`}
						</button>
						<button
							type="button"
							aria-pressed={configureAmount}
							onClick={() => setConfigureAmount(true)}
							disabled={isSubmitting}
							className={cn(
								"min-h-9 border-l border-market-close-stroke-card px-3 text-xs font-semibold transition-colors duration-150",
								configureAmount
									? "bg-market-close-control text-market-close-on-control"
									: "bg-modal text-market-close-muted hover:bg-market-close-hover",
							)}
						>
							{t`Partial amount`}
						</button>
					</fieldset>

					<Checkbox
						checked={configureAmount}
						onCheckedChange={(checked) => setConfigureAmount(checked === true)}
						disabled={isSubmitting}
						label={t`Configure amount`}
						className="items-center gap-2 min-[1001px]:hidden"
						controlClassName="size-5 !rounded-[5px] border-market-close-stroke-control bg-modal transition-all duration-[120ms] focus-visible:border-market-close-focus data-checked:border-market-close-control data-checked:bg-market-close-control"
						indicatorClassName="text-market-close-on-control [&>svg]:size-3"
						labelClassName="text-[13px] font-normal text-market-close-muted"
					/>

					{configureAmount ? (
						<div>
							<NumberInput
								aria-label={t`Configured TP/SL amount`}
								value={sizeInput}
								onChange={(event) => {
									setSizeInput(event.target.value);
									setSubmitError(null);
								}}
								maxAllowedDecimals={positionRef.szDecimals}
								min={0}
								maxLabel={t`Max`}
								onMaxClick={() => setSizeInput(toBig(size)?.toFixed(positionRef.szDecimals, 0) ?? "")}
								suffix={positionRef.coin}
								mobileSafe
								className="h-11 rounded-[10px] border-market-close-stroke-input bg-modal text-right font-semibold tabular-nums"
								disabled={isSubmitting}
							/>
							{sizeError ? <p className="mt-1 text-xs text-error">{sizeError}</p> : null}
						</div>
					) : null}

					<Checkbox
						checked={isLimitExecution}
						onCheckedChange={handleExecutionModeChange}
						disabled={isSubmitting}
						label={t`Limit execution`}
						className="items-center gap-2"
						controlClassName="size-5 !rounded-[5px] border-market-close-stroke-control bg-modal transition-all duration-[120ms] focus-visible:border-market-close-focus data-checked:border-market-close-control data-checked:bg-market-close-control"
						indicatorClassName="text-market-close-on-control [&>svg]:size-3"
						labelClassName="text-[13px] font-normal text-market-close-muted"
					/>

					{isLimitExecution ? (
						<div className="grid grid-cols-2 gap-2">
							<div>
								<NumberInput
									aria-label={t`Take profit limit price`}
									placeholder={t`Take profit limit`}
									value={tpLimitPriceInput}
									onChange={(event) => {
										setTpLimitPriceInput(event.target.value);
										setSubmitError(null);
									}}
									min={0}
									mobileSafe
									className="h-11 rounded-[10px] border-market-close-stroke-input bg-modal font-semibold tabular-nums"
									disabled={isSubmitting || !hasTp}
								/>
								{tpLimitError ? <p className="mt-1 text-xs text-error">{tpLimitError}</p> : null}
							</div>
							<div>
								<NumberInput
									aria-label={t`Stop loss limit price`}
									placeholder={t`Stop loss limit`}
									value={slLimitPriceInput}
									onChange={(event) => {
										setSlLimitPriceInput(event.target.value);
										setSubmitError(null);
									}}
									min={0}
									mobileSafe
									className="h-11 rounded-[10px] border-market-close-stroke-input bg-modal font-semibold tabular-nums"
									disabled={isSubmitting || !hasSl}
								/>
								{slLimitError ? <p className="mt-1 text-xs text-error">{slLimitError}</p> : null}
							</div>
						</div>
					) : null}

					{planError ? <p className="text-xs text-error">{planError}</p> : null}
					<p className="text-[11px] leading-relaxed text-market-close-subtle">
						{t`By default, TP/SL applies to the whole position and submits a market order when mark price reaches the trigger. Configure an amount to keep a fixed size, or select limit execution to submit at your limit price.`}
					</p>
				</div>

				{guardMessage && (
					<div className="mt-3 px-2 py-1.5 rounded-8 bg-warning-soft border border-stroke-warning-weak text-xs text-warning">
						{guardMessage}
					</div>
				)}
				{visibleError && (
					<div className="mt-3 px-2 py-1.5 rounded-8 bg-error-soft border border-stroke-error-weak text-xs text-error">
						{visibleError}
					</div>
				)}
			</div>

			<ModalFooter className="max-[1000px]:grid max-[1000px]:grid-cols-2 max-[1000px]:gap-2 max-[1000px]:px-4 max-[1000px]:pt-0 max-[1000px]:pb-4">
				<Button
					size="sm"
					variant="ghost"
					intent="neutral"
					onClick={() => handleOpenChange(false)}
					disabled={isSubmitting}
					className="max-[1000px]:min-h-11 max-[1000px]:rounded-[10px] max-[1000px]:border max-[1000px]:border-market-close-stroke-input max-[1000px]:text-market-close-fg"
				>
					{t`Cancel`}
				</Button>
				<TradingActionButton
					onClick={handleSubmit}
					disabled={!canSubmit}
					containerClassName="max-[1000px]:w-full"
					className="min-w-24 max-[1000px]:min-h-11 max-[1000px]:w-full max-[1000px]:rounded-[10px]"
				>
					{isSubmitting ? (
						<>
							<SpinnerGapIcon className="size-3.5 animate-spin" />
							{t`Submitting...`}
						</>
					) : (
						t`Confirm`
					)}
				</TradingActionButton>
			</ModalFooter>
		</PositionRiskDialogShell>
	);
}

interface StatusProps {
	open: boolean;
	isMobile: boolean;
	position: TpSlPositionTarget;
	message?: string;
	loading?: boolean;
	onClose: (open: boolean) => void;
}

function PositionTpSlStatus({ open, isMobile, position, message, loading = false, onClose }: StatusProps) {
	return (
		<PositionRiskDialogShell open={open} onOpenChange={onClose} isMobile={isMobile} dismissible>
			{renderPositionHeader(position.coin, position.isLong)}
			<ModalContent className="max-[1000px]:px-4 max-[1000px]:pt-3">
				{message ? (
					<div className="flex min-h-28 items-center justify-center text-sm text-fg-muted">{message}</div>
				) : (
					<DataPendingState loading={loading} />
				)}
			</ModalContent>
			<ModalFooter className="max-[1000px]:px-4 max-[1000px]:pt-0 max-[1000px]:pb-4">
				<Button
					size="sm"
					variant="ghost"
					intent="neutral"
					onClick={() => onClose(false)}
					className="max-[1000px]:min-h-11 max-[1000px]:w-full max-[1000px]:rounded-[10px] max-[1000px]:border max-[1000px]:border-market-close-stroke-input"
				>
					{t`Close`}
				</Button>
			</ModalFooter>
		</PositionRiskDialogShell>
	);
}

function renderPositionHeader(coin: string, isLong: boolean) {
	return (
		<ModalHeader className="max-[1000px]:gap-1 max-[1000px]:border-b-0 max-[1000px]:px-4 max-[1000px]:pt-7 max-[1000px]:pr-4 max-[1000px]:pb-0">
			<ModalTitle>{t`Manage TP/SL`}</ModalTitle>
			<div className="flex items-center gap-1.5">
				<span
					className={cn("h-4 w-0.5 shrink-0 rounded-full", isLong ? "bg-success" : "bg-error")}
					aria-hidden="true"
				/>
				<AssetDisplay coin={coin} />
				<span className="text-xs text-fg-muted">· {isLong ? t`Long position` : t`Short position`}</span>
			</div>
		</ModalHeader>
	);
}
