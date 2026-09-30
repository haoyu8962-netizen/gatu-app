import { Button, Select } from "@gatu/ui";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { ListIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MOBILE_FILTER_CHIP_CLASS } from "@/components/trade/mobile/mobile-filter-chip";
import { DataPendingState } from "@/components/ui/data-pending-state";
import { FALLBACK_VALUE_PLACEHOLDER, HL_ALL_DEXS } from "@/config/app";
import {
	type CancelAllConfirmationBlockReason,
	type CancelAllConfirmationSnapshot,
	createCancelAllConfirmationSnapshot,
	validateCancelAllConfirmationSnapshot,
} from "@/domain/trade/cancel-all-orders-confirmation";
import { isLiveMarkPriceReady } from "@/domain/trade/market-price";
import { buildOpenOrderCancelActions, isConfirmedOpenOrderCancelResponse } from "@/domain/trade/open-order-cancel";
import {
	getOpenOrderModifyCapabilities,
	type OpenOrderModifyBlockReason,
	type OpenOrderModifyMarketBinding,
	openOrderModifyParamsEqual,
} from "@/domain/trade/open-order-modification";
import {
	buildOpenOrderModifyFormPlan,
	createOpenOrderModifyFormTarget,
	type OpenOrderModifyFormTarget,
} from "@/domain/trade/open-order-modification-form";
import { isAmbiguousExchangeRequestError } from "@/domain/trade/order-tracking";
import { throwIfAnyResponseError } from "@/domain/trade/orders";
import {
	getToolbarOrderMetrics,
	getToolbarTriggerConditionOperator,
	isToolbarOrderNearMark,
	matchesToolbarOrderFilters,
	type ToolbarOrderDirectionFilter,
	type ToolbarOrderTypeFilter,
} from "@/domain/trade/trading-toolbar-metrics";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { type ActionFailure, formatActionFailure } from "@/lib/errors/action-error";
import { formatDateTime, formatNumber, formatPercent, formatPrice, formatToken } from "@/lib/format";
import {
	type ExchangeParams,
	type SubscriptionStatus,
	useExchange,
	useHyperliquid,
	useMarkets,
	useMarketsInfo,
	useSubscription,
} from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { isClosePositionOrder, isMarketTriggerOrder, type OpenOrder } from "@/lib/trade/open-orders";
import {
	ensurePendingTradingActionFeedback,
	syncPendingTradingActionFeedback,
	updatePendingTradingActionFeedback,
} from "@/lib/trade/pending-trading-action-feedback";
import { classifyTradingActionError } from "@/lib/trade/trading-action-failure";
import type { Side } from "@/lib/trade/types";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import type { OrderQueueItem } from "@/stores/use-order-queue-store";
import {
	getPendingTradingActionActions,
	usePendingOrderCancellations,
	usePendingOrderModifications,
} from "@/stores/use-pending-trading-action-store";
import { CancelAllOrdersModal } from "../positions/cancel-all-orders-modal";
import { MobileDisclosureHeader } from "./mobile-disclosure-header";
import { MobileOrderModificationModal } from "./mobile-order-modification-modal";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { type MobileDisclosureSetState, useMobileDisclosureSet } from "./use-mobile-disclosure-set";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

interface Props {
	className?: string;
	disclosureState?: MobileDisclosureSetState;
	scrollMode?: MobileDataScrollMode;
}

type CancelScope = "row" | "all";
type ModifyPhase = "idle" | "submitting" | "awaiting";

type OrderValidationErrorCode =
	| "cancellation-response-unconfirmed"
	| "failed-to-cancel"
	| "failed-to-modify"
	| "order-markets-unavailable"
	| "previous-modification-unconfirmed"
	| "trading-data-changed"
	| "modification-unconfirmed";

type OrderValidationError =
	| { kind: "cancel-block"; reason: CancelAllConfirmationBlockReason }
	| { kind: "modify-block"; reason: OpenOrderModifyBlockReason }
	| { kind: "code"; code: OrderValidationErrorCode }
	| { kind: "failure"; failure: ActionFailure };

class OrderValidationErrorCause extends Error {
	constructor(
		readonly validationError: OrderValidationError,
		message: string,
	) {
		super(message);
		this.name = "OrderValidationErrorCause";
	}
}

interface CancelCallbacks {
	onSettled?: () => void;
}

interface CancelAllDialogSnapshot {
	confirmation: CancelAllConfirmationSnapshot;
	orders: readonly OpenOrder[];
}

interface CancelExecutionContext {
	actionId: string;
	guardPasses: number;
	confirmation: CancelAllConfirmationSnapshot;
	orders: readonly Pick<OpenOrder, "coin" | "oid">[];
	params: ExchangeParams<"cancel">;
}

interface MobileOrderFiltersState {
	ownerKey: string | null;
	type: ToolbarOrderTypeFilter;
	direction: ToolbarOrderDirectionFilter;
}

function isToolbarOrderTypeFilter(value: string | null): value is ToolbarOrderTypeFilter {
	return value === "all" || value === "limit" || value === "trigger";
}

function isToolbarOrderDirectionFilter(value: string | null): value is ToolbarOrderDirectionFilter {
	return value === "all" || value === "buy" || value === "sell";
}

interface ModifyExecutionContext {
	actionId: string;
	guardPasses: number;
	target: OpenOrderModifyFormTarget;
	size: string;
	triggerPrice?: string;
	normalizedSize: string;
	normalizedTriggerPrice: string | null;
	params: ExchangeParams<"batchModify">;
	session: {
		clientKey: string;
		snapshotOwner: string;
		env: "Mainnet" | "Testnet";
	};
}

interface ModifyLiveContext {
	clientKey: string;
	env: "Mainnet" | "Testnet";
	snapshotOwner: string;
	snapshotStatus: SubscriptionStatus;
	isSnapshotStale: boolean;
	orders: readonly OpenOrder[];
	getMarketBinding: (coin: string) => OpenOrderModifyMarketBinding | null;
}

function normalizeSessionOwner(owner: string | null | undefined): string | null {
	if (!owner || owner === "disconnected") return null;
	return owner.toLowerCase();
}

function cancelParamsEqual(left: ExchangeParams<"cancel">, right: ExchangeParams<"cancel">): boolean {
	return (
		left.cancels.length === right.cancels.length &&
		left.cancels.every((cancel, index) => {
			const other = right.cancels[index];
			return other?.a === cancel.a && other.o === cancel.o;
		})
	);
}

function getModifyExecutionSession(live: ModifyLiveContext): ModifyExecutionContext["session"] | null {
	const clientKey = normalizeSessionOwner(live.clientKey);
	const snapshotOwner = normalizeSessionOwner(live.snapshotOwner);
	if (!clientKey || !snapshotOwner || clientKey !== snapshotOwner) return null;
	return { clientKey, snapshotOwner, env: live.env };
}

function isModifyExecutionSessionCurrent(execution: ModifyExecutionContext, live: ModifyLiveContext): boolean {
	return isModifyExecutionSessionBindingCurrent(execution, live.clientKey, live.snapshotOwner, live.env);
}

function isModifyExecutionSessionBindingCurrent(
	execution: ModifyExecutionContext,
	clientKey: string | null | undefined,
	snapshotOwner: string | null | undefined,
	env: "Mainnet" | "Testnet",
): boolean {
	const normalizedClientKey = normalizeSessionOwner(clientKey);
	const normalizedSnapshotOwner = normalizeSessionOwner(snapshotOwner);
	return (
		normalizedClientKey === execution.session.clientKey &&
		normalizedSnapshotOwner === execution.session.snapshotOwner &&
		env === execution.session.env
	);
}

export function MobileOrdersTab({ className, disclosureState, scrollMode = "contained" }: Props) {
	const { t } = useLingui();
	const { address, isConnected } = useWalletSession();
	const navigateToMarket = useMarketNavigation();
	const { setActiveTab } = useMobileTerminalTab();
	const { setSide } = useOrderEntryActions();
	const { getFullOrderTypeLabel, getOrderSideLabel } = useOrderDisplayLabels();
	const markets = useMarkets();

	function handleSelectMarket(name: string, side: Side) {
		navigateToMarket(name, undefined, { displayedContent: "trade" });
		setSide(side);
		setActiveTab("trade");
	}

	const {
		data: openOrdersEvent,
		status,
		isStale,
	} = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);

	const { clientKey, env } = useHyperliquid();
	const { getMarketInfo } = useMarketsInfo();
	const pendingModifications = usePendingOrderModifications();
	const pendingCancellations = usePendingOrderCancellations();
	const normalizedClientOwner = normalizeSessionOwner(clientKey);
	const normalizedSnapshotOwner = normalizeSessionOwner(address);
	const tradingSessionKey =
		normalizedClientOwner && normalizedClientOwner === normalizedSnapshotOwner
			? `${env}:${normalizedClientOwner}`
			: null;
	const sessionModifications = normalizedClientOwner
		? pendingModifications.filter((action) => action.env === env && action.owner === normalizedClientOwner)
		: [];
	const sessionCancellations = normalizedClientOwner
		? pendingCancellations.filter((action) => action.env === env && action.owner === normalizedClientOwner)
		: [];
	const sharedCancellingOids = new Set(sessionCancellations.flatMap((action) => action.oids));

	const [pendingScopes, setPendingScopes] = useState<Set<CancelScope>>(() => new Set());
	const [cancelAllOpen, setCancelAllOpen] = useState(false);
	const [cancelAllSnapshot, setCancelAllSnapshot] = useState<CancelAllDialogSnapshot | null>(null);
	const [cancelValidationError, setCancelValidationErrorState] = useState<OrderValidationError | null>(null);
	const [cancelValidationActionId, setCancelValidationActionId] = useState<string | null>(null);
	const ownerKey = address?.toLowerCase() ?? null;
	const [filters, setFilters] = useState<MobileOrderFiltersState>({
		ownerKey,
		type: "all",
		direction: "all",
	});
	const typeFilter = filters.ownerKey === ownerKey ? filters.type : "all";
	const directionFilter = filters.ownerKey === ownerKey ? filters.direction : "all";
	const [modifyTarget, setModifyTarget] = useState<OpenOrderModifyFormTarget | null>(null);
	const [modifySize, setModifySize] = useState("");
	const [modifyTriggerPrice, setModifyTriggerPrice] = useState<string | undefined>(undefined);
	const [modifyPhase, setModifyPhaseState] = useState<ModifyPhase>("idle");
	const [modifyValidationError, setModifyValidationErrorState] = useState<OrderValidationError | null>(null);
	const [modifyValidationActionId, setModifyValidationActionId] = useState<string | null>(null);
	const cancelAllSubmittingRef = useRef(false);
	const cancelExecutionRef = useRef<CancelExecutionContext | null>(null);
	const modifyTargetRef = useRef<OpenOrderModifyFormTarget | null>(null);
	const modifySizeRef = useRef("");
	const modifyTriggerPriceRef = useRef<string | undefined>(undefined);
	const modifyPhaseRef = useRef<ModifyPhase>("idle");
	const modifyExecutionRef = useRef<ModifyExecutionContext | null>(null);
	const localTradingSessionKeyRef = useRef(tradingSessionKey);
	const mountedRef = useRef(false);

	const openOrders = openOrdersEvent?.orders ?? [];
	const visibleCancelValidationErrorDescriptor =
		cancelValidationActionId && !sessionCancellations.some((action) => action.id === cancelValidationActionId)
			? null
			: cancelValidationError;
	const visibleModifyValidationErrorDescriptor =
		modifyValidationActionId && !sessionModifications.some((action) => action.id === modifyValidationActionId)
			? null
			: modifyValidationError;
	const visibleCancelValidationError = getValidationErrorMessage(visibleCancelValidationErrorDescriptor);
	const visibleModifyValidationError = getValidationErrorMessage(visibleModifyValidationErrorDescriptor);

	function setCancelValidationError(error: OrderValidationError | null, actionId: string | null = null) {
		setCancelValidationErrorState(error);
		setCancelValidationActionId(actionId);
	}

	function reportCancelFeedback(error: OrderValidationError, actionId: string | null = null) {
		setCancelValidationError(error, actionId);
		const message = getValidationErrorMessage(error) ?? "";
		if (actionId) return;
		if (error.kind === "cancel-block") {
			toast.warning(message);
		} else {
			toast.error(message);
		}
	}

	function setModifyValidationError(error: OrderValidationError | null, actionId: string | null = null) {
		setModifyValidationErrorState(error);
		setModifyValidationActionId(actionId);
	}
	const isPageScroll = scrollMode === "page";
	const displayedOrders = openOrders.filter((order) => matchesToolbarOrderFilters(order, typeFilter, directionFilter));
	const orderKeys = displayedOrders.map((order) => `${order.coin}:${order.oid}`);
	const openOrdersSnapshotBindingRef = useRef({
		event: openOrdersEvent,
		ownerKey,
		env,
	});
	if (openOrdersSnapshotBindingRef.current.event !== openOrdersEvent) {
		openOrdersSnapshotBindingRef.current = { event: openOrdersEvent, ownerKey, env };
	}
	const { expandedKeys: expandedOrderKeys, setExpanded: setOrderExpanded } = useMobileDisclosureSet(
		`${env}:${address?.toLowerCase() ?? "disconnected"}`,
		orderKeys,
		disclosureState,
	);

	function getMarketBinding(coin: string): OpenOrderModifyMarketBinding | null {
		if (markets.isLoading || markets.error) return null;
		const market = markets.getMarket(coin);
		if (!market) return null;
		const marketInfo = getMarketInfo(coin);
		return {
			coin,
			assetId: market.assetId,
			szDecimals: market.szDecimals,
			kind: market.kind,
			markPx: isLiveMarkPriceReady(
				marketInfo?.markPriceStatus ?? "loading",
				marketInfo?.markPx,
				marketInfo?.markPriceReceivedAt,
			)
				? marketInfo?.markPx
				: undefined,
		};
	}

	function handleTypeFilterChange(value: string | null) {
		if (!isToolbarOrderTypeFilter(value)) return;
		setFilters((current) => ({
			ownerKey,
			type: value,
			direction: current.ownerKey === ownerKey ? current.direction : "all",
		}));
	}

	function handleDirectionFilterChange(value: string | null) {
		if (!isToolbarOrderDirectionFilter(value)) return;
		setFilters((current) => ({
			ownerKey,
			type: current.ownerKey === ownerKey ? current.type : "all",
			direction: value,
		}));
	}

	const liveModifyContextRef = useRef<ModifyLiveContext>({
		clientKey,
		env,
		snapshotOwner: address ?? "disconnected",
		snapshotStatus: status,
		isSnapshotStale: isStale,
		orders: openOrders,
		getMarketBinding,
	});
	liveModifyContextRef.current = {
		clientKey,
		env,
		snapshotOwner: address ?? "disconnected",
		snapshotStatus: status,
		isSnapshotStale: isStale,
		orders: openOrders,
		getMarketBinding,
	};

	function isCancelExecutionCurrent(execution: CancelExecutionContext): boolean {
		const live = liveModifyContextRef.current;
		return (
			cancelExecutionRef.current === execution &&
			normalizeSessionOwner(live.clientKey) === execution.confirmation.owner &&
			normalizeSessionOwner(live.snapshotOwner) === execution.confirmation.owner &&
			live.env === execution.confirmation.env
		);
	}

	function assertCancelExecution(params: ExchangeParams<"cancel">) {
		const execution = cancelExecutionRef.current;
		if (!execution || !cancelParamsEqual(params, execution.params)) {
			throw createValidationErrorCause({ kind: "cancel-block", reason: "orders-changed" });
		}

		const live = liveModifyContextRef.current;
		const currentOrders: Pick<OpenOrder, "coin" | "oid">[] = [];
		for (const target of execution.orders) {
			const matches = live.orders.filter((order) => order.coin === target.coin && order.oid === target.oid);
			if (matches.length !== 1) {
				throw createValidationErrorCause({ kind: "cancel-block", reason: "orders-changed" });
			}
			const currentOrder = matches[0];
			if (!currentOrder) {
				throw createValidationErrorCause({ kind: "cancel-block", reason: "orders-changed" });
			}
			currentOrders.push(currentOrder);
		}

		const reason = validateCancelAllConfirmationSnapshot(execution.confirmation, {
			owner: live.clientKey,
			snapshotOwner: live.snapshotOwner,
			env: live.env,
			isSnapshotReady: live.snapshotStatus === "active" && !live.isSnapshotStale,
			orders: currentOrders,
		});
		if (reason) throw createValidationErrorCause({ kind: "cancel-block", reason });
		execution.guardPasses += 1;
		if (execution.guardPasses >= 2) {
			getPendingTradingActionActions().markOrderCancellationRequestStarted(execution.actionId);
		}
	}

	const { mutateAsync: cancelOrdersAsync, reset: resetCancelError } = useExchange("cancel", {
		executionGuard: assertCancelExecution,
	});

	function setModifyPhase(nextPhase: ModifyPhase) {
		modifyPhaseRef.current = nextPhase;
		setModifyPhaseState(nextPhase);
	}

	function getModifyPhase(): ModifyPhase {
		return modifyPhaseRef.current;
	}

	function getModifyBlockMessage(reason: OpenOrderModifyBlockReason): string {
		return t(getModifyBlockDescriptor(reason));
	}

	function getModifyBlockDescriptor(reason: OpenOrderModifyBlockReason): MessageDescriptor {
		switch (reason) {
			case "ambiguous-order":
			case "order-changed":
			case "order-not-open":
				return msg`This order changed or is no longer open. Refresh and try again.`;
			case "client-order-id":
				return msg`Orders with a client order ID cannot be modified here. Cancel and replace the order instead.`;
			case "grouped-order":
				return msg`Orders with linked TP/SL orders cannot be modified here.`;
			case "invalid-market-binding":
			case "market-binding-changed":
				return msg`Market metadata changed. Refresh and try again.`;
			case "invalid-order-shape":
				return msg`This order has incomplete data and cannot be modified. Refresh and try again.`;
			case "invalid-owner":
				return msg`Reconnect the trading account before modifying this order.`;
			case "invalid-price":
				return msg`Enter a valid trigger price using the market's price precision.`;
			case "invalid-size":
				return msg`Enter a valid size using the market's size precision.`;
			case "invalid-trigger-direction":
				return msg`The trigger price is invalid for this order direction.`;
			case "mark-price-unavailable":
				return msg`Mark price is unavailable. Wait for market data and try again.`;
			case "no-change":
				return msg`Enter a different value before confirming.`;
			case "position-tpsl":
				return msg`Position TP/SL orders must be edited from the position controls.`;
			case "session-changed":
				return msg`The trading account or network changed. Reopen the editor and try again.`;
			case "size-exceeds-remaining":
				return msg`Size cannot exceed the order's remaining size.`;
			case "snapshot-not-ready":
				return msg`Open orders are refreshing. Wait for live data and try again.`;
			case "trigger-price-not-applicable":
				return msg`This order does not have an editable trigger price.`;
			case "unsupported-market-order":
				return msg`Market orders cannot be modified after submission.`;
			case "unsupported-order-type":
			case "unsupported-system-order":
			case "unsupported-tif":
				return msg`This order type cannot be modified safely. Cancel and replace it instead.`;
		}
	}

	function getValidationErrorMessage(error: OrderValidationError | null): string | null {
		if (!error) return null;
		if (error.kind === "failure") return formatActionFailure(error.failure, (descriptor) => t(descriptor));
		return t(getValidationErrorDescriptor(error));
	}

	function getValidationErrorDescriptor(error: Exclude<OrderValidationError, { kind: "failure" }>): MessageDescriptor {
		switch (error.kind) {
			case "cancel-block":
				return getCancelAllBlockDescriptor(error.reason);
			case "modify-block":
				return getModifyBlockDescriptor(error.reason);
			case "code":
				switch (error.code) {
					case "cancellation-response-unconfirmed":
						return msg`The cancellation response could not be confirmed. Refresh open orders before retrying.`;
					case "failed-to-cancel":
						return msg`Failed to cancel order.`;
					case "failed-to-modify":
						return msg`Failed to modify order.`;
					case "order-markets-unavailable":
						return msg`Some order markets are unavailable. Refresh and try again.`;
					case "previous-modification-unconfirmed":
						return msg`The previous order modification is still unconfirmed. Refresh open orders before retrying.`;
					case "trading-data-changed":
						return msg`Trading data changed before the order modification could be submitted.`;
					case "modification-unconfirmed":
						return msg`The order update was not confirmed by live data. Refresh before retrying; cancellation remains available.`;
				}
		}
	}

	function createValidationErrorCause(error: OrderValidationError): OrderValidationErrorCause {
		return new OrderValidationErrorCause(error, getValidationErrorMessage(error) ?? "");
	}

	function getValidationErrorFromCause(
		cause: unknown,
		fallbackCode: Extract<OrderValidationError, { kind: "code" }>["code"],
	): OrderValidationError {
		if (cause instanceof OrderValidationErrorCause) return cause.validationError;
		const failure = classifyTradingActionError(cause);
		return failure ? { kind: "failure", failure } : { kind: "code", code: fallbackCode };
	}

	function getValidationErrorFeedback(error: OrderValidationError): Pick<OrderQueueItem, "error" | "message"> {
		if (error.kind === "failure") return { error: error.failure };
		if (error.kind === "code" && (error.code === "failed-to-cancel" || error.code === "failed-to-modify")) return {};
		return { message: getValidationErrorDescriptor(error) };
	}

	function buildPlanFromLive(target: OpenOrderModifyFormTarget, size: string, triggerPrice: string | undefined) {
		const live = liveModifyContextRef.current;
		const market = live.getMarketBinding(target.size.order.coin);
		if (!market) return { status: "blocked", reason: "market-binding-changed", field: null } as const;
		return buildOpenOrderModifyFormPlan({
			target,
			session: { owner: live.clientKey, env: live.env },
			snapshot: {
				owner: live.snapshotOwner,
				env: live.env,
				status: live.snapshotStatus === "active" && live.isSnapshotStale ? "subscribing" : live.snapshotStatus,
				orders: live.orders,
			},
			market,
			size,
			triggerPrice,
		});
	}

	function assertModifyExecution(params: ExchangeParams<"batchModify">) {
		const execution = modifyExecutionRef.current;
		if (!execution || modifyPhaseRef.current !== "submitting") {
			throw createValidationErrorCause({ kind: "code", code: "trading-data-changed" });
		}
		if (!isModifyExecutionSessionCurrent(execution, liveModifyContextRef.current)) {
			throw createValidationErrorCause({ kind: "modify-block", reason: "session-changed" });
		}
		const currentPlan = buildPlanFromLive(execution.target, execution.size, execution.triggerPrice);
		if (currentPlan.status === "blocked") {
			throw createValidationErrorCause({ kind: "modify-block", reason: currentPlan.reason });
		}
		if (
			!openOrderModifyParamsEqual(currentPlan.params, execution.params) ||
			!openOrderModifyParamsEqual(params, execution.params)
		) {
			throw createValidationErrorCause({ kind: "code", code: "trading-data-changed" });
		}
		execution.guardPasses += 1;
		if (execution.guardPasses >= 2) {
			getPendingTradingActionActions().markModificationRequestStarted(execution.actionId);
		}
	}

	const { mutateAsync: modifyOrders, reset: resetModifyError } = useExchange("batchModify", {
		executionGuard: assertModifyExecution,
	});

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			cancelExecutionRef.current = null;
			modifyExecutionRef.current = null;
			modifyPhaseRef.current = "idle";
		};
	}, []);

	useLayoutEffect(() => {
		if (localTradingSessionKeyRef.current === tradingSessionKey) return;
		localTradingSessionKeyRef.current = tradingSessionKey;
		cancelExecutionRef.current = null;
		cancelAllSubmittingRef.current = false;
		setPendingScopes(new Set());
		setCancelAllOpen(false);
		setCancelAllSnapshot(null);
		setCancelValidationErrorState(null);
		setCancelValidationActionId(null);
		modifyTargetRef.current = null;
		modifySizeRef.current = "";
		modifyTriggerPriceRef.current = undefined;
		modifyExecutionRef.current = null;
		modifyPhaseRef.current = "idle";
		setModifyTarget(null);
		setModifySize("");
		setModifyTriggerPrice(undefined);
		setModifyValidationErrorState(null);
		setModifyValidationActionId(null);
		setModifyPhaseState("idle");
		resetCancelError();
		resetModifyError();
	}, [tradingSessionKey, resetCancelError, resetModifyError]);

	function clearModifyModal(error: OrderValidationError | null = null, actionId: string | null = null) {
		modifyTargetRef.current = null;
		modifySizeRef.current = "";
		modifyTriggerPriceRef.current = undefined;
		modifyExecutionRef.current = null;
		setModifyTarget(null);
		setModifySize("");
		setModifyTriggerPrice(undefined);
		setModifyValidationError(error, actionId);
		setModifyPhase("idle");
	}

	function handleRequestModify(order: OpenOrder) {
		if (
			modifyPhaseRef.current !== "idle" ||
			pendingScopes.size > 0 ||
			sharedCancellingOids.has(order.oid) ||
			sessionModifications.some((action) => action.oid === order.oid)
		) {
			return;
		}
		const market = getMarketBinding(order.coin);
		if (!market) {
			setModifyValidationError({ kind: "modify-block", reason: "invalid-market-binding" });
			return;
		}
		const result = createOpenOrderModifyFormTarget({ owner: clientKey, env, market, order });
		if (result.status === "blocked") {
			setModifyValidationError({ kind: "modify-block", reason: result.reason });
			return;
		}

		const triggerPrice = result.target.triggerPrice ? order.triggerPx : undefined;
		modifyTargetRef.current = result.target;
		modifySizeRef.current = order.sz;
		modifyTriggerPriceRef.current = triggerPrice;
		modifyExecutionRef.current = null;
		setModifyTarget(result.target);
		setModifySize(order.sz);
		setModifyTriggerPrice(triggerPrice);
		setModifyValidationError(null);
		resetModifyError();
	}

	function handleModifyUnavailable(message: string) {
		toast.info(message);
	}

	function handleModifyOpenChange(open: boolean) {
		if (open || modifyPhaseRef.current !== "idle") return;
		clearModifyModal();
		resetModifyError();
	}

	function handleModifySizeChange(value: string) {
		if (modifyPhaseRef.current !== "idle") return;
		modifySizeRef.current = value;
		setModifySize(value);
		setModifyValidationError(null);
		resetModifyError();
	}

	function handleModifyTriggerPriceChange(value: string) {
		if (modifyPhaseRef.current !== "idle") return;
		modifyTriggerPriceRef.current = value;
		setModifyTriggerPrice(value);
		setModifyValidationError(null);
		resetModifyError();
	}

	async function handleConfirmModify() {
		if (modifyPhaseRef.current !== "idle") return;
		const target = modifyTargetRef.current;
		if (!target) return;
		const size = modifySizeRef.current;
		const triggerPrice = modifyTriggerPriceRef.current;
		const plan = buildPlanFromLive(target, size, triggerPrice);
		if (plan.status === "blocked") {
			setModifyValidationError({ kind: "modify-block", reason: plan.reason });
			return;
		}
		const session = getModifyExecutionSession(liveModifyContextRef.current);
		if (!session || session.clientKey !== target.size.owner || session.env !== target.size.env) {
			setModifyValidationError({ kind: "modify-block", reason: "session-changed" });
			return;
		}

		const pendingAction = getPendingTradingActionActions().claimModification({
			env: session.env,
			owner: session.clientKey,
			oid: target.size.order.oid,
			originalSize: target.size.order.sz,
			originalTriggerPx: target.size.order.triggerPx,
			expectedSize: plan.normalizedSize,
			...(plan.normalizedTriggerPrice === null ? {} : { expectedTriggerPx: plan.normalizedTriggerPrice }),
		});
		if (!pendingAction) {
			setModifyValidationError({ kind: "code", code: "previous-modification-unconfirmed" });
			return;
		}
		ensurePendingTradingActionFeedback(pendingAction, "modify");
		const execution: ModifyExecutionContext = {
			actionId: pendingAction.id,
			guardPasses: 0,
			target,
			size,
			triggerPrice,
			normalizedSize: plan.normalizedSize,
			normalizedTriggerPrice: plan.normalizedTriggerPrice,
			params: plan.params,
			session,
		};
		modifyExecutionRef.current = execution;
		setModifyValidationError(null);
		resetModifyError();
		setModifyPhase("submitting");

		try {
			const result = await modifyOrders(plan.params);
			throwIfAnyResponseError(result.response?.data?.statuses);
			getPendingTradingActionActions().markModificationAwaiting(execution.actionId);
			syncPendingTradingActionFeedback({ ...pendingAction, phase: "awaiting" }, "modify");
			if (!mountedRef.current || modifyExecutionRef.current !== execution) return;
			const live = liveModifyContextRef.current;
			if (getModifyPhase() !== "submitting" || !isModifyExecutionSessionCurrent(execution, live)) {
				clearModifyModal();
				return;
			}
			setModifyPhase("awaiting");
		} catch (cause) {
			if (execution.guardPasses >= 2 && isAmbiguousExchangeRequestError(cause)) {
				getPendingTradingActionActions().markModificationUnconfirmed(execution.actionId);
				syncPendingTradingActionFeedback({ ...pendingAction, phase: "unconfirmed" }, "modify");
				if (
					!mountedRef.current ||
					modifyExecutionRef.current !== execution ||
					!isModifyExecutionSessionCurrent(execution, liveModifyContextRef.current)
				) {
					return;
				}
				const validationError = { kind: "code", code: "modification-unconfirmed" } as const;
				clearModifyModal(validationError, execution.actionId);
				return;
			} else {
				getPendingTradingActionActions().resolveModification(execution.actionId);
				const validationError = getValidationErrorFromCause(cause, "failed-to-modify");
				updatePendingTradingActionFeedback(pendingAction, "modify", {
					status: "failed",
					...getValidationErrorFeedback(validationError),
				});
			}
			if (
				!mountedRef.current ||
				modifyExecutionRef.current !== execution ||
				!isModifyExecutionSessionCurrent(execution, liveModifyContextRef.current)
			) {
				return;
			}
			const validationError = getValidationErrorFromCause(cause, "failed-to-modify");
			clearModifyModal(validationError);
		}
	}

	useEffect(() => {
		if (modifyPhase !== "awaiting") return;
		const execution = modifyExecutionRef.current;
		if (!execution) return;
		const pending = pendingModifications.find((action) => action.id === execution.actionId);
		if (pending?.phase === "awaiting" || pending?.phase === "submitting") return;

		modifyTargetRef.current = null;
		modifySizeRef.current = "";
		modifyTriggerPriceRef.current = undefined;
		modifyExecutionRef.current = null;
		modifyPhaseRef.current = "idle";
		setModifyTarget(null);
		setModifySize("");
		setModifyTriggerPrice(undefined);
		setModifyValidationErrorState(
			pending?.phase === "unconfirmed" ? { kind: "code", code: "modification-unconfirmed" } : null,
		);
		setModifyValidationActionId(pending?.phase === "unconfirmed" ? execution.actionId : null);
		setModifyPhaseState("idle");
	}, [modifyPhase, pendingModifications]);

	function handleCancel(ordersToCancel: OpenOrder[], nextScope: CancelScope, callbacks?: CancelCallbacks): boolean {
		if (ordersToCancel.length === 0 || modifyPhaseRef.current !== "idle" || cancelExecutionRef.current !== null) {
			return false;
		}
		setCancelValidationError(null);

		const fresh = ordersToCancel.filter((order) => !sharedCancellingOids.has(order.oid));
		if (fresh.length === 0) return false;
		if (nextScope === "all" && fresh.length !== ordersToCancel.length) {
			reportCancelFeedback({ kind: "cancel-block", reason: "orders-changed" });
			return false;
		}

		const cancels = buildOpenOrderCancelActions(fresh, markets.getAssetId);
		if (!cancels) {
			reportCancelFeedback({ kind: "code", code: "order-markets-unavailable" });
			return false;
		}

		const live = liveModifyContextRef.current;
		const confirmation = createCancelAllConfirmationSnapshot({
			owner: live.clientKey,
			snapshotOwner: live.snapshotOwner,
			env: live.env,
			isSnapshotReady: live.snapshotStatus === "active" && !live.isSnapshotStale,
			orders: fresh,
		});
		if (confirmation.status === "blocked") {
			reportCancelFeedback({ kind: "cancel-block", reason: confirmation.reason });
			return false;
		}
		const pendingAction = getPendingTradingActionActions().claimOrderCancellation({
			env: confirmation.snapshot.env,
			owner: confirmation.snapshot.owner,
			oids: fresh.map((order) => order.oid),
		});
		if (!pendingAction) return false;
		ensurePendingTradingActionFeedback(pendingAction, "cancel");
		const execution: CancelExecutionContext = {
			actionId: pendingAction.id,
			guardPasses: 0,
			confirmation: confirmation.snapshot,
			orders: fresh.map(({ coin, oid }) => ({ coin, oid })),
			params: { cancels },
		};
		cancelExecutionRef.current = execution;

		setPendingScopes((prev) => {
			const next = new Set(prev);
			next.add(nextScope);
			return next;
		});
		resetCancelError();
		void executeCancellation(execution, nextScope, callbacks);
		return true;
	}

	async function executeCancellation(
		execution: CancelExecutionContext,
		nextScope: CancelScope,
		callbacks?: CancelCallbacks,
	): Promise<void> {
		const feedbackIdentity = {
			id: execution.actionId,
			owner: execution.confirmation.owner,
			env: execution.confirmation.env,
		};
		try {
			const response = await cancelOrdersAsync(execution.params);
			if (!isConfirmedOpenOrderCancelResponse(response, execution.params.cancels.length)) {
				getPendingTradingActionActions().markOrderCancellationAwaiting(execution.actionId);
				syncPendingTradingActionFeedback({ ...feedbackIdentity, phase: "awaiting" }, "cancel");
				if (mountedRef.current && isCancelExecutionCurrent(execution)) {
					reportCancelFeedback({ kind: "code", code: "cancellation-response-unconfirmed" }, execution.actionId);
				}
				return;
			}
			getPendingTradingActionActions().markOrderCancellationAwaiting(execution.actionId);
			syncPendingTradingActionFeedback({ ...feedbackIdentity, phase: "awaiting" }, "cancel");
			if (!mountedRef.current || !isCancelExecutionCurrent(execution)) return;
		} catch (cause) {
			if (execution.guardPasses >= 2 && isAmbiguousExchangeRequestError(cause)) {
				getPendingTradingActionActions().markOrderCancellationUnconfirmed(execution.actionId);
				syncPendingTradingActionFeedback({ ...feedbackIdentity, phase: "unconfirmed" }, "cancel");
				if (mountedRef.current && isCancelExecutionCurrent(execution)) {
					reportCancelFeedback({ kind: "code", code: "cancellation-response-unconfirmed" }, execution.actionId);
				}
			} else {
				getPendingTradingActionActions().releaseOrderCancellation(execution.actionId);
				const validationError = getValidationErrorFromCause(cause, "failed-to-cancel");
				updatePendingTradingActionFeedback(feedbackIdentity, "cancel", {
					status: "failed",
					...getValidationErrorFeedback(validationError),
				});
				if (mountedRef.current && isCancelExecutionCurrent(execution)) {
					setCancelValidationError(validationError);
				}
			}
		} finally {
			if (mountedRef.current && isCancelExecutionCurrent(execution)) {
				cancelExecutionRef.current = null;
				setPendingScopes((prev) => {
					const next = new Set(prev);
					next.delete(nextScope);
					return next;
				});
				callbacks?.onSettled?.();
			}
		}
	}

	function handleCancelRow(ordersToCancel: OpenOrder[]) {
		const reason = getCancelRowBlockReason(ordersToCancel);
		if (reason) {
			reportCancelFeedback({ kind: "cancel-block", reason });
			return;
		}
		handleCancel(ordersToCancel, "row");
	}

	function getCancelAllBlockDescriptor(reason: CancelAllConfirmationBlockReason): MessageDescriptor {
		switch (reason) {
			case "orders-changed":
				return msg`Open orders changed. Reopen the confirmation and try again.`;
			case "session-changed":
				return msg`The trading account or network changed. Reopen the confirmation and try again.`;
			case "snapshot-not-ready":
				return msg`Open orders are refreshing. Wait for live data and try again.`;
		}
	}

	function getCancelAllConfirmationInput() {
		return {
			owner: clientKey,
			snapshotOwner: address,
			env,
			isSnapshotReady: status === "active" && !isStale,
			orders: openOrders,
		} as const;
	}

	function getCancelRowBlockReason(ordersToCancel: readonly OpenOrder[]): CancelAllConfirmationBlockReason | null {
		const snapshot = createCancelAllConfirmationSnapshot(getCancelAllConfirmationInput());
		if (snapshot.status === "blocked") return snapshot.reason;

		const binding = openOrdersSnapshotBindingRef.current;
		if (binding.ownerKey !== ownerKey || binding.env !== env) return "session-changed";
		if (ordersToCancel.length === 0) return "orders-changed";

		const requestedKeys = new Set(ordersToCancel.map((order) => `${order.coin}\u0000${order.oid}`));
		if (requestedKeys.size !== ordersToCancel.length) return "orders-changed";
		for (const order of ordersToCancel) {
			if (openOrders.filter((candidate) => candidate.coin === order.coin && candidate.oid === order.oid).length !== 1) {
				return "orders-changed";
			}
		}
		return null;
	}

	function handleRequestCancelAll() {
		if (
			openOrders.length === 0 ||
			pendingScopes.size > 0 ||
			cancelAllSubmittingRef.current ||
			modifyPhaseRef.current !== "idle"
		) {
			return;
		}
		resetCancelError();
		setCancelValidationError(null);
		const result = createCancelAllConfirmationSnapshot(getCancelAllConfirmationInput());
		if (result.status === "blocked") {
			reportCancelFeedback({ kind: "cancel-block", reason: result.reason });
			return;
		}
		setCancelAllSnapshot({ confirmation: result.snapshot, orders: [...openOrders] });
		setCancelAllOpen(true);
	}

	function handleConfirmCancelAll() {
		if (cancelAllSubmittingRef.current || pendingScopes.size > 0 || modifyPhaseRef.current !== "idle") return;
		if (!cancelAllOpen || !cancelAllSnapshot) return;
		setCancelAllOpen(false);
		const reason = validateCancelAllConfirmationSnapshot(
			cancelAllSnapshot.confirmation,
			getCancelAllConfirmationInput(),
		);
		if (reason) {
			reportCancelFeedback({ kind: "cancel-block", reason });
			return;
		}
		cancelAllSubmittingRef.current = true;
		const started = handleCancel([...cancelAllSnapshot.orders], "all", {
			onSettled: () => {
				cancelAllSubmittingRef.current = false;
			},
		});
		if (!started) cancelAllSubmittingRef.current = false;
	}

	function handleCancelAllOpenChange(open: boolean) {
		if (cancelAllSubmittingRef.current || pendingScopes.size > 0 || modifyPhaseRef.current !== "idle") return;
		setCancelAllOpen(open);
	}

	const draftModifyPlan = modifyTarget ? buildPlanFromLive(modifyTarget, modifySize, modifyTriggerPrice) : null;
	const draftModifyError =
		draftModifyPlan?.status === "blocked" &&
		draftModifyPlan.reason !== "no-change" &&
		draftModifyPlan.reason !== "snapshot-not-ready"
			? getModifyBlockMessage(draftModifyPlan.reason)
			: null;
	const draftInvalidField = draftModifyPlan?.status === "blocked" ? draftModifyPlan.field : null;
	const modalError = visibleModifyValidationError ?? draftModifyError;
	const actionError = visibleCancelValidationError ?? (modifyTarget ? null : modalError);
	const hasActiveModification = sessionModifications.some((action) => action.phase !== "unconfirmed");
	const isModifyBusy = modifyPhase !== "idle" || hasActiveModification;
	const isModifyConfirmDisabled = isModifyBusy || !draftModifyPlan || draftModifyPlan.status === "blocked";
	const modifyOrder = modifyTarget
		? (openOrders.find((order) => order.oid === modifyTarget.size.order.oid) ?? null)
		: null;
	const modifyMarketLabel = modifyOrder ? (markets.getMarket(modifyOrder.coin)?.shortName ?? modifyOrder.coin) : "";

	function renderFilterToolbar(disabled: boolean) {
		return (
			<div
				data-testid="mobile-orders-filter-toolbar"
				className="flex h-9 shrink-0 items-center gap-1.5 border-b border-market-close-stroke-card px-3.5"
			>
				<Select
					disabled={disabled}
					size="xxs"
					label={t`Order type`}
					value={typeFilter}
					onValueChange={handleTypeFilterChange}
					options={[
						{ value: "all", label: t`Type` },
						{ value: "limit", label: t`Limit` },
						{ value: "trigger", label: t`Trigger` },
					]}
					triggerClassName={MOBILE_FILTER_CHIP_CLASS}
					popupClassName="font-market-close transition-opacity data-starting-style:scale-100 data-ending-style:scale-100"
					className="w-auto shrink-0 [&>label]:sr-only"
				/>
				<Select
					disabled={disabled}
					size="xxs"
					label={t`Direction`}
					value={directionFilter}
					onValueChange={handleDirectionFilterChange}
					options={[
						{ value: "all", label: t`Direction` },
						{ value: "buy", label: t`Buy` },
						{ value: "sell", label: t`Sell` },
					]}
					triggerClassName={MOBILE_FILTER_CHIP_CLASS}
					popupClassName="font-market-close transition-opacity data-starting-style:scale-100 data-ending-style:scale-100"
					className="w-auto shrink-0 [&>label]:sr-only"
				/>
				{openOrders.length > 0 ? (
					<Button
						variant="link"
						intent="error"
						size="sm"
						className="relative ms-auto h-[27px] min-h-0 shrink-0 px-1.5 text-xs font-semibold text-market-close-danger no-underline shadow-none after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] hover:no-underline active:not-data-disabled:scale-100"
						onClick={handleRequestCancelAll}
						disabled={pendingScopes.size > 0 || isModifyBusy}
					>
						{t({ message: "Cancel all", context: "Current orders toolbar" })}
					</Button>
				) : null}
			</div>
		);
	}

	if (!isConnected) {
		return (
			<div className={cn(isPageScroll ? "min-h-0 flex flex-col" : "flex-1 min-h-0 flex flex-col", className)}>
				{renderFilterToolbar(true)}
				<div className={cn("px-3.5 py-3", !isPageScroll && "flex-1 min-h-0")} />
			</div>
		);
	}

	const isDataReady = status === "active" && openOrdersEvent !== undefined && !isStale;

	return (
		<div className={cn(isPageScroll ? "min-h-0 flex flex-col" : "flex-1 min-h-0 flex flex-col", className)}>
			{actionError && (
				<div role="alert" className="px-3 pb-1 text-xs text-error">
					{actionError}
				</div>
			)}
			{isDataReady ? (
				<>
					{renderFilterToolbar(false)}
					<div className={cn("space-y-2.5 px-3.5 py-3", !isPageScroll && "flex-1 min-h-0 overflow-y-auto")}>
						{openOrders.length === 0 ? (
							<div className="flex min-h-44 flex-col items-center justify-center gap-2 py-11 text-center">
								<div className="flex size-10 items-center justify-center rounded-full bg-market-close-hover">
									<ListIcon className="size-4 text-market-close-subtle" aria-hidden="true" />
								</div>
								<div className="space-y-0.5">
									<p className="text-2sm font-semibold leading-[18px] text-market-close-muted">{t`No open orders.`}</p>
									<p className="text-xs leading-4 text-market-close-subtle">
										{t`Submitted limit and trigger orders will appear here.`}
									</p>
								</div>
							</div>
						) : displayedOrders.length === 0 ? (
							<div className="py-11 text-center text-xs text-market-close-muted">{t`No orders match the filters.`}</div>
						) : null}
						{displayedOrders.map((order) => {
							const orderKey = `${order.coin}:${order.oid}`;
							const modifyCapability = getOpenOrderModifyCapabilities(order).size;
							const market = markets.getMarket(order.coin);
							return (
								<MobileOrderCard
									key={orderKey}
									order={order}
									szDecimals={market?.szDecimals ?? markets.getSzDecimals(order.coin)}
									marketType={market?.kind === "spot" ? "spot" : "perp"}
									marketLabel={market?.shortName ?? order.coin}
									markPx={(() => {
										const marketInfo = getMarketInfo(order.coin);
										return isLiveMarkPriceReady(
											marketInfo?.markPriceStatus ?? "loading",
											marketInfo?.markPx,
											marketInfo?.markPriceReceivedAt,
										)
											? (marketInfo?.markPx ?? "")
											: "";
									})()}
									expanded={expandedOrderKeys.has(orderKey)}
									isCancelling={sharedCancellingOids.has(order.oid)}
									actionsDisabled={isModifyBusy || pendingScopes.size > 0}
									canModify={modifyCapability.supported}
									modifyDisabled={
										isModifyBusy ||
										sessionModifications.some((action) => action.oid === order.oid) ||
										pendingScopes.size > 0 ||
										sharedCancellingOids.has(order.oid)
									}
									modifyUnavailableReason={
										modifyCapability.reason ? getModifyBlockMessage(modifyCapability.reason) : undefined
									}
									onCancel={handleCancelRow}
									onModify={handleRequestModify}
									onModifyUnavailable={handleModifyUnavailable}
									onSelectMarket={handleSelectMarket}
									onExpandedChange={(expanded) => setOrderExpanded(orderKey, expanded)}
								/>
							);
						})}
					</div>
				</>
			) : (
				<DataPendingState
					loading={status === "idle" || status === "subscribing" || (status === "active" && !openOrdersEvent)}
				/>
			)}
			<CancelAllOrdersModal
				open={cancelAllOpen}
				orderCount={cancelAllSnapshot?.orders.length ?? 0}
				onOpenChange={handleCancelAllOpenChange}
				onConfirm={handleConfirmCancelAll}
			/>
			{modifyOrder ? (
				<MobileOrderModificationModal
					open={modifyPhase === "idle"}
					marketLabel={modifyMarketLabel}
					directionLabel={getOrderSideLabel(modifyOrder.side, modifyOrder.reduceOnly)}
					directionTone={modifyOrder.side === "B" ? "positive" : "negative"}
					typeLabel={getFullOrderTypeLabel(modifyOrder)}
					sizeValue={modifySize}
					triggerPriceValue={modifyTriggerPrice}
					sizeInvalid={draftInvalidField === "size"}
					triggerPriceInvalid={draftInvalidField === "triggerPrice"}
					isInteractionLocked={isModifyBusy}
					isConfirmDisabled={isModifyConfirmDisabled}
					errorMessage={modalError}
					onSizeChange={handleModifySizeChange}
					onTriggerPriceChange={handleModifyTriggerPriceChange}
					onOpenChange={handleModifyOpenChange}
					onConfirm={handleConfirmModify}
				/>
			) : null}
		</div>
	);
}

interface MobileOrderCardProps {
	order: OpenOrder;
	szDecimals: number;
	marketType: "perp" | "spot";
	marketLabel: string;
	markPx: string;
	expanded: boolean;
	isCancelling: boolean;
	actionsDisabled: boolean;
	canModify: boolean;
	modifyDisabled: boolean;
	modifyUnavailableReason?: string;
	onCancel: (orders: OpenOrder[]) => void;
	onModify: (order: OpenOrder) => void;
	onModifyUnavailable: (message: string) => void;
	onSelectMarket: (marketName: string, side: Side) => void;
	onExpandedChange: (expanded: boolean) => void;
}

interface OrderMetricProps {
	label: ReactNode;
	value: ReactNode;
	valueClassName?: string;
}

function OrderMetric({ label, value, valueClassName }: OrderMetricProps) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<div className="truncate text-3xs leading-[14px] text-market-close-subtle">{label}</div>
			<div
				className={cn(
					"truncate text-xs font-semibold leading-[17px] tabular-nums text-market-close-fg",
					valueClassName,
				)}
			>
				{value}
			</div>
		</div>
	);
}

function MobileOrderCard({
	order,
	szDecimals,
	marketType,
	marketLabel,
	markPx,
	expanded,
	isCancelling,
	actionsDisabled,
	canModify,
	modifyDisabled,
	modifyUnavailableReason,
	onCancel,
	onModify,
	onModifyUnavailable,
	onSelectMarket,
	onExpandedChange,
}: MobileOrderCardProps) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const detailsId = useId();
	const { getOrderSideLabel, getOrderTypeLabel, getTriggerConditionLabel } = useOrderDisplayLabels();
	const sideLabel = getOrderSideLabel(order.side, order.reduceOnly);
	const isBuy = order.side === "B";
	const side: Side = isBuy ? "buy" : "sell";
	const typeLabel = getOrderTypeLabel(order.orderType);
	const sizeLabel = isClosePositionOrder(order) ? t`Close Position` : formatToken(order.sz, { decimals: szDecimals });
	const originalSizeLabel = isClosePositionOrder(order)
		? t`Close Position`
		: formatToken(order.origSz, { decimals: szDecimals });
	const priceLabel = isMarketTriggerOrder(order) ? t`Market` : formatPrice(order.limitPx, { szDecimals, marketType });
	const triggerOperator = getToolbarTriggerConditionOperator(order.triggerCondition);
	const triggerConditionLabel = order.isTrigger
		? triggerOperator
			? `${triggerOperator} ${formatNumber(order.triggerPx)}`
			: order.triggerCondition
				? getTriggerConditionLabel(order.triggerCondition)
				: FALLBACK_VALUE_PLACEHOLDER
		: FALLBACK_VALUE_PLACEHOLDER;
	const metrics = getToolbarOrderMetrics({
		isTrigger: order.isTrigger,
		limitPx: order.limitPx,
		triggerPx: order.triggerPx,
		sz: order.sz,
		markPx,
	});
	const markDistanceLabel =
		order.isTrigger && metrics.markDistanceRatio
			? formatPercent(metrics.markDistanceRatio, { decimals: 1, signDisplay: "exceptZero" })
			: null;
	const isNearMark = isToolbarOrderNearMark(metrics.markDistanceRatio);

	return (
		<article
			data-account-card
			className="overflow-hidden rounded-[14px] border border-market-close-stroke-card bg-surface"
		>
			<MobileDisclosureHeader
				expanded={expanded}
				label={expanded ? t`Collapse ${marketLabel} order details` : t`Expand ${marketLabel} order details`}
				controls={detailsId}
				onToggle={() => onExpandedChange(!expanded)}
				className="grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_16px] gap-2.5 px-3.5 py-[11px]"
			>
				<div className="flex min-w-0 flex-col gap-0.5">
					<div className="truncate text-3xs leading-[14px] text-market-close-subtle">{t`Market`}</div>
					<button
						type="button"
						onClick={() => onSelectMarket(order.coin, side)}
						aria-label={t`Switch to ${marketLabel} market`}
						className="pointer-events-auto relative z-10 max-w-full truncate rounded-xs text-start text-xs font-bold leading-[17px] text-market-close-fg after:absolute after:top-1/2 after:left-1/2 after:h-11 after:min-w-11 after:w-full after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus"
					>
						{marketLabel}
					</button>
				</div>
				<OrderMetric label={t`Type`} value={typeLabel} />
				<OrderMetric label={t`Size`} value={sizeLabel} />
			</MobileDisclosureHeader>

			{expanded ? (
				<div id={detailsId} className="flex flex-col gap-2.5 px-3.5 py-3">
					<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-x-2.5 gap-y-3">
						<OrderMetric
							label={t`Time`}
							value={formatDateTime(order.timestamp, { dateStyle: "short", timeStyle: "short" })}
						/>
						<OrderMetric
							label={t`Direction`}
							value={sideLabel}
							valueClassName={isBuy ? "text-market-close-success" : "text-market-close-danger"}
						/>
						<OrderMetric label={t`Price`} value={priceLabel} />
						<OrderMetric label={t`Trigger Condition`} value={triggerConditionLabel} />
						<OrderMetric
							label={t`Distance to mark`}
							value={markDistanceLabel ?? FALLBACK_VALUE_PLACEHOLDER}
							valueClassName={isNearMark ? "text-market-close-warning" : "text-market-close-muted"}
						/>
						<OrderMetric label={t`Original Size`} value={originalSizeLabel} />
						<OrderMetric label={t`Reduce Only`} value={order.reduceOnly ? t`Yes` : t`No`} />
					</div>

					<div className="flex items-center border-t border-market-close-stroke-card/60 pt-2.5">
						<div className="flex items-center gap-4">
							<button
								type="button"
								className="relative inline-flex h-[18px] items-center rounded-xs text-2sm leading-[18px] font-semibold whitespace-nowrap text-market-close-fg after:absolute after:top-[calc(50%_-_1px)] after:left-1/2 after:h-11 after:min-w-11 after:w-full after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus aria-disabled:text-market-close-subtle disabled:cursor-not-allowed disabled:text-market-close-subtle"
								onClick={() => {
									if (!canModify) {
										if (modifyUnavailableReason) onModifyUnavailable(modifyUnavailableReason);
										return;
									}
									onModify(order);
								}}
								disabled={modifyDisabled}
								aria-disabled={!canModify || modifyDisabled}
								title={modifyUnavailableReason}
								aria-label={modifyUnavailableReason ? `${t`Modify Order`}: ${modifyUnavailableReason}` : undefined}
							>
								{t`Modify Order`}
							</button>
							<button
								type="button"
								className="relative inline-flex h-[18px] items-center gap-1.5 rounded-xs text-2sm leading-[18px] font-semibold whitespace-nowrap text-market-close-danger after:absolute after:top-[calc(50%_-_1px)] after:left-1/2 after:h-11 after:min-w-11 after:w-full after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus disabled:cursor-not-allowed disabled:text-fg-disabled"
								onClick={() => onCancel([order])}
								disabled={isCancelling || actionsDisabled}
							>
								{t`Cancel`}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</article>
	);
}
