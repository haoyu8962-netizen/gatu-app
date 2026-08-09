import {
	Button,
	Checkbox,
	Select,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	Tooltip,
} from "@gatu/ui";
import { Plural, useLingui } from "@lingui/react/macro";
import { ListIcon, PencilIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DEFAULT_QUOTE_TOKEN, FALLBACK_VALUE_PLACEHOLDER, HL_ALL_DEXS } from "@/config/app";
import { getMarketQuoteToken } from "@/domain/trade/balances";
import {
	type CancelAllConfirmationBlockReason,
	type CancelAllConfirmationSnapshot,
	createCancelAllConfirmationSnapshot,
	validateCancelAllConfirmationSnapshot,
} from "@/domain/trade/cancel-all-orders-confirmation";
import { buildOpenOrderCancelActions, isConfirmedOpenOrderCancelResponse } from "@/domain/trade/open-order-cancel";
import {
	buildOpenOrderModifyPlan,
	createOpenOrderModifyTarget,
	getOpenOrderModifyCapabilities,
	type OpenOrderModifyBlockReason,
	type OpenOrderModifyField,
	type OpenOrderModifyMarketBinding,
	type OpenOrderModifyTarget,
	openOrderModifyParamsEqual,
} from "@/domain/trade/open-order-modification";
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
import {
	formatDateTime,
	formatNumber,
	formatPercent,
	formatPrice,
	formatQuoteAmount,
	formatToken,
	formatUSD,
} from "@/lib/format";
import {
	type ExchangeParams,
	type SubscriptionStatus,
	useExchange,
	useHyperliquid,
	useMarkets,
	useMarketsInfo,
	useSubscription,
} from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import {
	isClosePositionOrder,
	isMarketTriggerOrder,
	isStopOrder,
	isTakeProfitOrder,
	type OpenOrder,
} from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { CancelAllOrdersModal } from "./cancel-all-orders-modal";
import { DesktopTabToolbarPortal } from "./desktop-tab-toolbar-portal";
import { OrderInlineEdit } from "./order-inline-edit";
import { Placeholder } from "./placeholder";
import {
	positionsPanelRowHoverClass,
	positionsPanelRowStripeClass,
	positionsPanelTableBodyClass,
	positionsPanelTableCellClass,
	positionsPanelTableHeadClass,
	positionsPanelTableHeaderClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";

const ordersTableHeadClass =
	"flex h-[33px] min-w-0 items-center px-0 py-0 text-[11px] font-semibold normal-case tracking-normal text-market-close-subtle";
const ordersTableCellClass = "flex h-[60px] min-w-0 items-center px-0 py-0 text-[13px] text-market-close-fg";
const ordersTableGridClass =
	"grid grid-cols-[126px_84px_70px_60px_100px_84px_104px_66px_52px_minmax(0,1fr)_76px_88px] gap-x-3 px-5";

type CancelScope = "row" | "selected" | "all";
const MODIFY_SUBSCRIPTION_TIMEOUT_MS = 15_000;

interface CancelCallbacks {
	onSuccess?: () => void;
	onSettled?: () => void;
}

interface CancelAllDialogSnapshot {
	confirmation: CancelAllConfirmationSnapshot;
	orders: readonly OpenOrder[];
}

type ModifyPhase = "idle" | "submitting" | "awaiting";

interface ModifyExecutionContext {
	target: OpenOrderModifyTarget;
	value: string;
	normalizedValue: string;
	params: ExchangeParams<"batchModify">;
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

interface CancelExecutionContext {
	confirmation: CancelAllConfirmationSnapshot;
	orders: readonly Pick<OpenOrder, "coin" | "oid">[];
	params: ExchangeParams<"cancel">;
}

interface EditReturnTarget {
	field: OpenOrderModifyField;
	oid: number;
}

interface SelectedOrdersState {
	ids: Set<number>;
	ownerKey: string | null;
}

const EMPTY_SELECTED_ORDER_IDS = new Set<number>();

function normalizeSessionOwner(owner: string | null | undefined): string | null {
	if (!owner || owner === "disconnected") return null;
	return owner.toLowerCase();
}

function getTradingSessionKey(
	clientKey: string,
	snapshotOwner: string | null | undefined,
	env: "Mainnet" | "Testnet",
): string | null {
	const clientOwner = normalizeSessionOwner(clientKey);
	const normalizedSnapshotOwner = normalizeSessionOwner(snapshotOwner);
	if (!clientOwner || clientOwner !== normalizedSnapshotOwner) return null;
	return `${env}:${clientOwner}`;
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

function getOrderEditTriggerId(oid: number, field: OpenOrderModifyField): string {
	return `order-edit-${oid}-${field}`;
}

function getCurrentOrderTriggerConditionLabel(condition: string, triggerPx: string): string | null {
	const operator = getToolbarTriggerConditionOperator(condition);
	if (!operator) return null;
	return `${operator} ${formatNumber(triggerPx)}`;
}

interface Props {
	toolbarTarget?: HTMLElement | null;
}

export function OrdersTab({ toolbarTarget }: Props = {}) {
	const { t } = useLingui();
	const { address, isConnected } = useWalletSession();
	const navigateToMarket = useMarketNavigation();
	const { setSide } = useOrderEntryActions();

	function handleSelectMarket(name: string, side: Side) {
		navigateToMarket(name);
		setSide(side);
	}
	const {
		data: openOrdersEvent,
		status,
		error,
		isStale,
	} = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const { clientKey, env } = useHyperliquid();
	const markets = useMarkets();
	const { getMarketInfo } = useMarketsInfo();
	const openOrders = openOrdersEvent?.orders ?? [];
	const selectionSessionKey = getTradingSessionKey(clientKey, address, env);
	const [selectedOrders, setSelectedOrders] = useState<SelectedOrdersState>(() => ({
		ids: new Set(),
		ownerKey: selectionSessionKey,
	}));
	const selectedOrderIds =
		selectedOrders.ownerKey === selectionSessionKey ? selectedOrders.ids : EMPTY_SELECTED_ORDER_IDS;
	const [cancellingOids, setCancellingOids] = useState<Set<number>>(() => new Set());
	const [pendingScopes, setPendingScopes] = useState<Set<CancelScope>>(() => new Set());
	const [cancelAllOpen, setCancelAllOpen] = useState(false);
	const [cancelAllSnapshot, setCancelAllSnapshot] = useState<CancelAllDialogSnapshot | null>(null);
	const [orderTypeFilter, setOrderTypeFilter] = useState<ToolbarOrderTypeFilter>("all");
	const [orderDirectionFilter, setOrderDirectionFilter] = useState<ToolbarOrderDirectionFilter>("all");
	const [cancelValidationError, setCancelValidationError] = useState<string | null>(null);
	const [editTarget, setEditTarget] = useState<OpenOrderModifyTarget | null>(null);
	const [editValue, setEditValue] = useState("");
	const [modifyPhase, setModifyPhaseState] = useState<ModifyPhase>("idle");
	const [modifyValidationError, setModifyValidationError] = useState<string | null>(null);
	const [unconfirmedModifyOid, setUnconfirmedModifyOid] = useState<number | null>(null);
	const modifyErrorId = useId();
	const cancelAllSubmittingRef = useRef(false);
	const cancelExecutionRef = useRef<CancelExecutionContext | null>(null);
	const editTargetRef = useRef<OpenOrderModifyTarget | null>(null);
	const editValueRef = useRef("");
	const modifyPhaseRef = useRef<ModifyPhase>("idle");
	const modifyExecutionRef = useRef<ModifyExecutionContext | null>(null);
	const unconfirmedExecutionRef = useRef<ModifyExecutionContext | null>(null);
	const editReturnTargetRef = useRef<EditReturnTarget | null>(null);
	const orderTypeFilterRef = useRef<HTMLDivElement>(null);
	const selectionSessionKeyRef = useRef(selectionSessionKey);
	const mountedRef = useRef(false);
	selectionSessionKeyRef.current = selectionSessionKey;

	function setSelectedOrderIds(nextIds: Set<number> | ((current: Set<number>) => Set<number>)) {
		const expectedSessionKey = selectionSessionKey;
		setSelectedOrders((current) => {
			if (selectionSessionKeyRef.current !== expectedSessionKey) return current;
			const currentIds = current.ownerKey === expectedSessionKey ? current.ids : EMPTY_SELECTED_ORDER_IDS;
			return {
				ids: typeof nextIds === "function" ? nextIds(currentIds) : nextIds,
				ownerKey: expectedSessionKey,
			};
		});
	}

	useLayoutEffect(() => {
		setSelectedOrders((current) =>
			current.ownerKey === selectionSessionKey
				? current
				: {
						ids: new Set(),
						ownerKey: selectionSessionKey,
					},
		);
	}, [selectionSessionKey]);

	useLayoutEffect(() => {
		if (editTarget !== null) return;
		const target = editReturnTargetRef.current;
		if (!target) return;
		editReturnTargetRef.current = null;
		const editTrigger = document.getElementById(getOrderEditTriggerId(target.oid, target.field));
		if (editTrigger instanceof HTMLButtonElement && !editTrigger.disabled) {
			editTrigger.focus();
			return;
		}
		const typeFilterTrigger = orderTypeFilterRef.current?.querySelector<HTMLButtonElement>('[role="combobox"]');
		if (typeFilterTrigger && !typeFilterTrigger.disabled) typeFilterTrigger.focus();
	}, [editTarget]);

	function getMarketBinding(coin: string): OpenOrderModifyMarketBinding | null {
		if (markets.isLoading || markets.error) return null;
		const market = markets.getMarket(coin);
		if (!market) return null;
		return {
			coin,
			assetId: market.assetId,
			szDecimals: market.szDecimals,
			kind: market.kind,
			markPx: getMarketInfo(coin)?.markPx,
		};
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

	function setModifyPhase(nextPhase: ModifyPhase) {
		modifyPhaseRef.current = nextPhase;
		setModifyPhaseState(nextPhase);
	}

	function getModifyPhase(): ModifyPhase {
		return modifyPhaseRef.current;
	}

	function getModifyBlockMessage(reason: OpenOrderModifyBlockReason): string {
		switch (reason) {
			case "ambiguous-order":
			case "order-changed":
			case "order-not-open":
				return t`This order changed or is no longer open. Refresh and try again.`;
			case "client-order-id":
				return t`Orders with a client order ID cannot be modified here. Cancel and replace the order instead.`;
			case "grouped-order":
				return t`Orders with linked TP/SL orders cannot be modified here.`;
			case "invalid-market-binding":
			case "market-binding-changed":
				return t`Market metadata changed. Refresh and try again.`;
			case "invalid-order-shape":
				return t`This order has incomplete data and cannot be modified. Refresh and try again.`;
			case "invalid-owner":
				return t`Reconnect the trading account before modifying this order.`;
			case "invalid-price":
				return t`Enter a valid trigger price using the market's price precision.`;
			case "invalid-size":
				return t`Enter a valid size using the market's size precision.`;
			case "invalid-trigger-direction":
				return t`The trigger price is invalid for this order direction.`;
			case "mark-price-unavailable":
				return t`Mark price is unavailable. Wait for market data and try again.`;
			case "no-change":
				return t`Enter a different value before confirming.`;
			case "position-tpsl":
				return t`Position TP/SL orders must be edited from the position controls.`;
			case "session-changed":
				return t`The trading account or network changed. Reopen the editor and try again.`;
			case "size-exceeds-remaining":
				return t`Size cannot exceed the order's remaining size.`;
			case "snapshot-not-ready":
				return t`Open orders are refreshing. Wait for live data and try again.`;
			case "trigger-price-not-applicable":
				return t`This order does not have an editable trigger price.`;
			case "unsupported-market-order":
				return t`Market orders cannot be modified after submission.`;
			case "unsupported-order-type":
			case "unsupported-system-order":
			case "unsupported-tif":
				return t`This order type cannot be modified safely. Cancel and replace it instead.`;
		}
	}

	function buildPlanFromLive(target: OpenOrderModifyTarget, value: string) {
		const live = liveModifyContextRef.current;
		const market = live.getMarketBinding(target.order.coin);
		if (!market) return { status: "blocked", reason: "market-binding-changed" } as const;
		return buildOpenOrderModifyPlan({
			target,
			session: { owner: live.clientKey, env: live.env },
			snapshot: {
				owner: live.snapshotOwner,
				env: live.env,
				status: live.snapshotStatus === "active" && live.isSnapshotStale ? "subscribing" : live.snapshotStatus,
				orders: live.orders,
			},
			market,
			value,
		});
	}

	function assertModifyExecution(params: ExchangeParams<"batchModify">) {
		const execution = modifyExecutionRef.current;
		if (!execution || getModifyPhase() !== "submitting") {
			throw new Error(t`Trading data changed before the order modification could be submitted.`);
		}

		const currentPlan = buildPlanFromLive(execution.target, execution.value);
		if (currentPlan.status === "blocked") throw new Error(getModifyBlockMessage(currentPlan.reason));
		if (
			!openOrderModifyParamsEqual(currentPlan.params, execution.params) ||
			!openOrderModifyParamsEqual(params, execution.params)
		) {
			throw new Error(t`Trading data changed before the order modification could be submitted.`);
		}
	}

	function assertCancelExecution(params: ExchangeParams<"cancel">) {
		const execution = cancelExecutionRef.current;
		if (!execution || !cancelParamsEqual(params, execution.params)) {
			throw new Error(getCancelAllBlockMessage("orders-changed"));
		}

		const live = liveModifyContextRef.current;
		const currentOrders: Pick<OpenOrder, "coin" | "oid">[] = [];
		for (const target of execution.orders) {
			const matches = live.orders.filter((order) => order.coin === target.coin && order.oid === target.oid);
			if (matches.length !== 1) throw new Error(getCancelAllBlockMessage("orders-changed"));
			const currentOrder = matches[0];
			if (!currentOrder) throw new Error(getCancelAllBlockMessage("orders-changed"));
			currentOrders.push(currentOrder);
		}

		const reason = validateCancelAllConfirmationSnapshot(execution.confirmation, {
			owner: live.clientKey,
			snapshotOwner: live.snapshotOwner,
			env: live.env,
			isSnapshotReady: live.snapshotStatus === "active" && !live.isSnapshotStale,
			orders: currentOrders,
		});
		if (reason) throw new Error(getCancelAllBlockMessage(reason));
	}

	const {
		mutate: cancelOrders,
		error: cancelError,
		reset: resetCancelError,
	} = useExchange("cancel", {
		executionGuard: assertCancelExecution,
	});
	const {
		mutateAsync: modifyOrders,
		error: modifyError,
		reset: resetModifyError,
	} = useExchange("batchModify", { executionGuard: assertModifyExecution });

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			cancelExecutionRef.current = null;
			modifyExecutionRef.current = null;
			unconfirmedExecutionRef.current = null;
			modifyPhaseRef.current = "idle";
		};
	}, []);

	const openIds = new Set(openOrders.map((order) => order.oid));
	const displayedOrders = openOrders.filter((order) =>
		matchesToolbarOrderFilters(order, orderTypeFilter, orderDirectionFilter),
	);
	const validSelectedIds = new Set<number>();
	for (const id of selectedOrderIds) {
		if (openIds.has(id)) validSelectedIds.add(id);
	}

	const displayedSelectedCount = displayedOrders.reduce(
		(count, order) => count + (validSelectedIds.has(order.oid) ? 1 : 0),
		0,
	);
	const selectedCount = displayedSelectedCount;
	const allSelected = displayedOrders.length > 0 && displayedSelectedCount === displayedOrders.length;
	const someSelected = displayedSelectedCount > 0 && displayedSelectedCount < displayedOrders.length;

	function handleOrderTypeFilterChange(value: string | null) {
		if (modifyPhaseRef.current !== "idle") return;
		if (editTargetRef.current) handleCancelEdit();
		setSelectedOrderIds(new Set());
		setOrderTypeFilter((value as ToolbarOrderTypeFilter | null) ?? "all");
	}

	function handleOrderDirectionFilterChange(value: string | null) {
		if (modifyPhaseRef.current !== "idle") return;
		if (editTargetRef.current) handleCancelEdit();
		setSelectedOrderIds(new Set());
		setOrderDirectionFilter((value as ToolbarOrderDirectionFilter | null) ?? "all");
	}

	function handleToggleAll(value: boolean | "indeterminate") {
		setSelectedOrderIds((current) => {
			const next = new Set(current);
			for (const order of displayedOrders) {
				if (value === true) next.add(order.oid);
				else next.delete(order.oid);
			}
			return next;
		});
	}

	function handleToggleOrder(orderId: number, value: boolean | "indeterminate") {
		setSelectedOrderIds((prev) => {
			const next = new Set(prev);
			if (value === true) {
				next.add(orderId);
			} else {
				next.delete(orderId);
			}
			return next;
		});
	}

	function handleCancel(ordersToCancel: OpenOrder[], nextScope: CancelScope, callbacks?: CancelCallbacks): boolean {
		if (ordersToCancel.length === 0 || modifyPhaseRef.current !== "idle" || cancelExecutionRef.current !== null) {
			return false;
		}
		setCancelValidationError(null);

		const fresh = ordersToCancel.filter((order) => !cancellingOids.has(order.oid));
		if (fresh.length === 0) return false;
		if (nextScope === "all" && fresh.length !== ordersToCancel.length) {
			setCancelValidationError(t`Open orders changed. Reopen the confirmation and try again.`);
			return false;
		}

		const cancels = buildOpenOrderCancelActions(fresh, markets.getAssetId);
		if (!cancels) {
			setCancelValidationError(t`Some order markets are unavailable. Refresh and try again.`);
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
			setCancelValidationError(getCancelAllBlockMessage(confirmation.reason));
			return false;
		}

		const execution: CancelExecutionContext = {
			confirmation: confirmation.snapshot,
			orders: fresh.map(({ coin, oid }) => ({ coin, oid })),
			params: { cancels },
		};
		cancelExecutionRef.current = execution;

		const oids = fresh.map((order) => order.oid);
		setCancellingOids((prev) => {
			const next = new Set(prev);
			for (const oid of oids) next.add(oid);
			return next;
		});
		setPendingScopes((prev) => {
			const next = new Set(prev);
			next.add(nextScope);
			return next;
		});
		resetCancelError();
		cancelOrders(execution.params, {
			onSuccess: (response) => {
				if (!isConfirmedOpenOrderCancelResponse(response, execution.params.cancels.length)) {
					setCancelValidationError(
						t`The cancellation response could not be confirmed. Refresh open orders before retrying.`,
					);
					return;
				}
				setSelectedOrderIds((prev) => {
					const next = new Set(prev);
					for (const order of fresh) {
						next.delete(order.oid);
					}
					return next;
				});
				callbacks?.onSuccess?.();
			},
			onSettled: () => {
				if (cancelExecutionRef.current === execution) cancelExecutionRef.current = null;
				setCancellingOids((prev) => {
					const next = new Set(prev);
					for (const oid of oids) next.delete(oid);
					return next;
				});
				setPendingScopes((prev) => {
					const next = new Set(prev);
					next.delete(nextScope);
					return next;
				});
				callbacks?.onSettled?.();
			},
		});
		return true;
	}

	function handleCancelRow(ordersToCancel: OpenOrder[]) {
		handleCancel(ordersToCancel, "row");
	}

	function handleCancelSelected() {
		const ordersToCancel = displayedOrders.filter((order) => validSelectedIds.has(order.oid));
		handleCancel(ordersToCancel, "selected");
	}

	function getCancelAllBlockMessage(reason: CancelAllConfirmationBlockReason): string {
		switch (reason) {
			case "orders-changed":
				return t`Open orders changed. Reopen the confirmation and try again.`;
			case "session-changed":
				return t`The trading account or network changed. Reopen the confirmation and try again.`;
			case "snapshot-not-ready":
				return t`Open orders are refreshing. Wait for live data and try again.`;
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

	function handleRequestCancelAll() {
		if (openOrders.length === 0 || pendingScopes.size > 0 || cancelAllSubmittingRef.current) return;
		resetCancelError();
		setCancelValidationError(null);
		const result = createCancelAllConfirmationSnapshot(getCancelAllConfirmationInput());
		if (result.status === "blocked") {
			setCancelValidationError(getCancelAllBlockMessage(result.reason));
			return;
		}
		setCancelAllSnapshot({ confirmation: result.snapshot, orders: [...openOrders] });
		setCancelAllOpen(true);
	}

	function handleConfirmCancelAll() {
		if (cancelAllSubmittingRef.current || pendingScopes.size > 0) return;
		if (!cancelAllSnapshot) return;
		const reason = validateCancelAllConfirmationSnapshot(
			cancelAllSnapshot.confirmation,
			getCancelAllConfirmationInput(),
		);
		if (reason) {
			setCancelValidationError(getCancelAllBlockMessage(reason));
			return;
		}
		cancelAllSubmittingRef.current = true;
		const started = handleCancel([...cancelAllSnapshot.orders], "all", {
			onSuccess: () => {
				setCancelAllOpen(false);
				setCancelAllSnapshot(null);
			},
			onSettled: () => {
				cancelAllSubmittingRef.current = false;
			},
		});
		if (!started) cancelAllSubmittingRef.current = false;
	}

	function handleCancelAllOpenChange(open: boolean) {
		if (cancelAllSubmittingRef.current || pendingScopes.size > 0) return;
		setCancelAllOpen(open);
		if (!open) setCancelAllSnapshot(null);
	}

	function clearEditSession() {
		editTargetRef.current = null;
		editValueRef.current = "";
		modifyExecutionRef.current = null;
		setEditTarget(null);
		setEditValue("");
		setModifyValidationError(null);
		setModifyPhase("idle");
	}

	function handleStartEdit(order: OpenOrder, field: OpenOrderModifyField) {
		if (modifyPhaseRef.current !== "idle" || pendingScopes.size > 0 || cancellingOids.has(order.oid)) {
			return;
		}
		if (unconfirmedExecutionRef.current) {
			setModifyValidationError(
				t`The previous order modification is still unconfirmed. Refresh open orders before retrying.`,
			);
			return;
		}

		const market = getMarketBinding(order.coin);
		if (!market) {
			setModifyValidationError(getModifyBlockMessage("invalid-market-binding"));
			return;
		}

		const result = createOpenOrderModifyTarget({ owner: clientKey, env, field, market, order });
		if (result.status === "blocked") {
			setModifyValidationError(getModifyBlockMessage(result.reason));
			return;
		}

		const value = field === "size" ? order.sz : order.triggerPx;
		editReturnTargetRef.current = { field, oid: order.oid };
		editTargetRef.current = result.target;
		editValueRef.current = value;
		modifyExecutionRef.current = null;
		setEditTarget(result.target);
		setEditValue(value);
		setModifyValidationError(null);
		resetModifyError();
	}

	function handleEditValueChange(value: string) {
		if (modifyPhaseRef.current !== "idle") return;
		editValueRef.current = value;
		setEditValue(value);
		setModifyValidationError(null);
		resetModifyError();
	}

	function handleCancelEdit() {
		if (modifyPhaseRef.current !== "idle") return;
		clearEditSession();
		resetModifyError();
	}

	async function handleConfirmEdit() {
		if (getModifyPhase() !== "idle") return;
		const target = editTargetRef.current;
		if (!target) return;

		const value = editValueRef.current;
		const plan = buildPlanFromLive(target, value);
		if (plan.status === "blocked") {
			setModifyValidationError(getModifyBlockMessage(plan.reason));
			return;
		}

		const execution: ModifyExecutionContext = {
			target,
			value,
			normalizedValue: plan.normalizedValue,
			params: plan.params,
		};
		modifyExecutionRef.current = execution;
		setModifyValidationError(null);
		resetModifyError();
		setModifyPhase("submitting");

		try {
			const result = await modifyOrders(plan.params);
			throwIfAnyResponseError(result.response?.data?.statuses);
			if (!mountedRef.current) return;
			const live = liveModifyContextRef.current;
			if (
				modifyExecutionRef.current !== execution ||
				getModifyPhase() !== "submitting" ||
				live.clientKey === "disconnected" ||
				live.clientKey.toLowerCase() !== execution.target.owner ||
				live.snapshotOwner.toLowerCase() !== execution.target.owner ||
				live.env !== execution.target.env
			) {
				throw new Error(t`Trading data changed before the order modification could be submitted.`);
			}
			setModifyPhase("awaiting");
			toast.info(t`Order modification submitted. Waiting for the open-orders update.`);
		} catch (cause) {
			if (!mountedRef.current) return;
			const message = cause instanceof Error ? cause.message : t`Failed to modify order.`;
			modifyExecutionRef.current = null;
			setModifyPhase("idle");
			setModifyValidationError(message);
			toast.error(message);
		}
	}

	useEffect(() => {
		if (modifyPhase !== "awaiting") return;
		const execution = modifyExecutionRef.current;
		if (!execution) return;

		const timeout = window.setTimeout(() => {
			if (!mountedRef.current || modifyPhaseRef.current !== "awaiting" || modifyExecutionRef.current !== execution) {
				return;
			}
			const message = t`The order update was not confirmed by live data. Refresh before retrying; cancellation remains available.`;
			unconfirmedExecutionRef.current = execution;
			modifyExecutionRef.current = null;
			editTargetRef.current = null;
			editValueRef.current = "";
			modifyPhaseRef.current = "idle";
			setUnconfirmedModifyOid(execution.target.order.oid);
			setEditTarget(null);
			setEditValue("");
			setModifyPhaseState("idle");
			setModifyValidationError(message);
			toast.error(message);
		}, MODIFY_SUBSCRIPTION_TIMEOUT_MS);

		return () => window.clearTimeout(timeout);
	}, [modifyPhase, t]);

	useEffect(() => {
		const execution = modifyPhase === "awaiting" ? modifyExecutionRef.current : unconfirmedExecutionRef.current;
		if (!execution) return;

		function finishReconciliation(errorMessage: string | null = null) {
			editTargetRef.current = null;
			editValueRef.current = "";
			modifyExecutionRef.current = null;
			unconfirmedExecutionRef.current = null;
			modifyPhaseRef.current = "idle";
			setEditTarget(null);
			setEditValue("");
			setModifyValidationError(errorMessage);
			setModifyPhaseState("idle");
			setUnconfirmedModifyOid(null);
		}

		const liveSessionKey = getTradingSessionKey(clientKey, address, env);
		const executionSessionKey = `${execution.target.env}:${execution.target.owner}`;
		if (liveSessionKey !== executionSessionKey) {
			const message = t`The trading account or network changed. Reopen the editor and try again.`;
			toast.error(message);
			finishReconciliation(message);
			return;
		}
		if (status !== "active" || isStale) return;

		const matches = openOrders.filter((order) => order.oid === execution.target.order.oid);
		if (matches.length === 0) {
			toast.info(t`The modified order is no longer open.`);
			finishReconciliation();
			return;
		}
		if (matches.length !== 1) {
			const message = t`This order changed or is no longer open. Refresh and try again.`;
			toast.error(message);
			finishReconciliation();
			return;
		}

		const latest = matches[0];
		if (!latest) return;
		const latestValue = execution.target.field === "size" ? latest.sz : latest.triggerPx;
		const latestNumeric = toBig(latestValue);
		const expectedNumeric = toBig(execution.normalizedValue);
		if (latestNumeric && expectedNumeric && latestNumeric.eq(expectedNumeric)) {
			toast.success(t`Order modification confirmed.`);
			finishReconciliation();
			return;
		}

		const originalValue =
			execution.target.field === "size" ? execution.target.order.sz : execution.target.order.triggerPx;
		const originalNumeric = toBig(originalValue);
		if (latestNumeric && originalNumeric && !latestNumeric.eq(originalNumeric)) {
			const message = t`The order changed before the requested modification was confirmed. Review the latest order before retrying.`;
			toast.error(message);
			finishReconciliation();
		}
	}, [modifyPhase, openOrders, status, isStale, clientKey, address, env, t]);

	const isModifyLocked = modifyPhase !== "idle";
	const disableCancelSelected = pendingScopes.has("selected") || selectedCount === 0 || isModifyLocked;
	const disableCancelAll = pendingScopes.size > 0 || openOrders.length === 0 || isModifyLocked;
	const actionError = cancelValidationError ?? modifyValidationError ?? cancelError?.message ?? modifyError?.message;
	const modifyActionErrorId =
		modifyValidationError && actionError === modifyValidationError ? modifyErrorId : undefined;

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view open orders.`}</Placeholder>;
		if (status === "subscribing" || status === "idle") return <Placeholder>{t`Loading open orders...`}</Placeholder>;
		if (status === "error") {
			return (
				<Placeholder variant="error">
					<span>{t`Failed to load open orders.`}</span>
					{error instanceof Error && <span className="mt-1 text-xs text-fg-muted">{error.message}</span>}
				</Placeholder>
			);
		}
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTabRootClass}>
			<DesktopTabToolbarPortal target={toolbarTarget}>
				<div
					data-testid="orders-toolbar-actions"
					className="flex min-w-0 shrink-0 items-center gap-2 font-market-close"
				>
					{isConnected ? (
						<span className="shrink-0 text-xs text-market-close-muted tabular-nums">
							<Plural value={openOrders.length} one="# order" other="# orders" />
						</span>
					) : null}
					<Select
						ref={orderTypeFilterRef}
						size="xxs"
						label={t`Order type`}
						value={orderTypeFilter}
						onValueChange={handleOrderTypeFilterChange}
						disabled={isModifyLocked}
						options={[
							{ value: "all", label: t`Type` },
							{ value: "limit", label: t`Limit` },
							{ value: "trigger", label: t`Trigger` },
						]}
						triggerClassName="h-[27px] min-w-14 max-w-32 !rounded-[7px] border-market-close-stroke-card bg-modal px-2.5 text-xs text-market-close-muted duration-[120ms] [&>*]:text-market-close-muted hover:border-market-close-control hover:[&>*]:text-market-close-fg focus-visible:border-market-close-control focus-visible:!outline-none data-popup-open:border-market-close-control"
						popupClassName="font-market-close transition-opacity data-starting-style:scale-100 data-ending-style:scale-100"
						className="w-auto [&>label]:sr-only"
					/>
					<Select
						size="xxs"
						label={t`Direction`}
						value={orderDirectionFilter}
						onValueChange={handleOrderDirectionFilterChange}
						disabled={isModifyLocked}
						options={[
							{ value: "all", label: t`Direction` },
							{ value: "buy", label: t`Buy` },
							{ value: "sell", label: t`Sell` },
						]}
						triggerClassName="h-[27px] min-w-14 max-w-32 !rounded-[7px] border-market-close-stroke-card bg-modal px-2.5 text-xs text-market-close-muted duration-[120ms] [&>*]:text-market-close-muted hover:border-market-close-control hover:[&>*]:text-market-close-fg focus-visible:border-market-close-control focus-visible:!outline-none data-popup-open:border-market-close-control"
						popupClassName="font-market-close transition-opacity data-starting-style:scale-100 data-ending-style:scale-100"
						className="w-auto [&>label]:sr-only"
					/>
					{isConnected && selectedCount > 0 ? (
						<span className="shrink-0 text-[11px] text-market-close-subtle tabular-nums">
							{selectedCount} {t`selected`}
						</span>
					) : null}
					{selectedCount > 0 ? (
						<Button
							variant="link"
							size="xs"
							aria-label={t`Cancel selected orders`}
							onClick={handleCancelSelected}
							disabled={disableCancelSelected}
							className="h-[27px] min-h-0 px-1.5 text-xs font-semibold text-market-close-danger no-underline shadow-none transition-colors duration-[120ms] hover:text-market-close-danger/80 hover:no-underline active:not-data-disabled:scale-100"
						>
							{pendingScopes.has("selected") ? t`Canceling...` : t`Cancel selected`}
						</Button>
					) : null}
					{openOrders.length > 0 ? (
						<Button
							variant="link"
							size="xs"
							aria-label={t`Cancel all orders`}
							onClick={handleRequestCancelAll}
							disabled={disableCancelAll}
							className="ml-1.5 h-[27px] min-h-0 px-0 text-xs font-semibold text-market-close-danger no-underline shadow-none transition-colors duration-[120ms] hover:text-market-close-danger/80 hover:no-underline active:not-data-disabled:scale-100"
						>
							{pendingScopes.has("all")
								? t`Canceling...`
								: t({ message: "Cancel all", context: "Current orders toolbar" })}
						</Button>
					) : null}
				</div>
			</DesktopTabToolbarPortal>
			{actionError ? (
				<div
					id={modifyActionErrorId}
					role={modifyActionErrorId ? "alert" : undefined}
					className="px-2.5 py-1 text-2xs text-error"
				>
					{actionError}
				</div>
			) : null}
			<div className={positionsPanelTableShellClass}>
				{placeholder ??
					(displayedOrders.length === 0 ? (
						<ScrollArea className="h-full w-full">
							<Table className="block min-w-[1280px] w-full font-market-close" containerClassName="!overflow-visible">
								<OrdersTableHeader
									allSelected={allSelected}
									someSelected={someSelected}
									disabled
									onToggleAll={handleToggleAll}
								/>
							</Table>
							<div className="sticky left-0 w-full">
								{openOrders.length === 0 ? (
									<OrdersEmptyState />
								) : (
									<Placeholder>{t`No orders match the selected filters.`}</Placeholder>
								)}
							</div>
							{openOrders.length > 0 ? <OrdersTableFooter /> : null}
						</ScrollArea>
					) : (
						<ScrollArea className="h-full w-full">
							<Table className="block min-w-[1280px] w-full font-market-close" containerClassName="!overflow-visible">
								<OrdersTableHeader
									allSelected={allSelected}
									someSelected={someSelected}
									disabled={displayedOrders.length === 0}
									onToggleAll={handleToggleAll}
								/>
								<TableBody className={cn(positionsPanelTableBodyClass, "block")}>
									{displayedOrders.map((order, i) => {
										const marketInfo = getMarketInfo(order.coin);
										const market = markets.getMarket(order.coin);
										const quoteSymbol = getMarketQuoteToken(market);
										return (
											<OrderRow
												key={order.oid}
												order={order}
												displayName={market?.shortName ?? order.coin.split(":").pop() ?? order.coin}
												szDecimals={markets.getSzDecimals(order.coin)}
												marketType={market?.kind === "spot" ? "spot" : "perp"}
												markPx={marketInfo?.markPx ?? ""}
												quoteSymbol={quoteSymbol}
												isSelected={validSelectedIds.has(order.oid)}
												isCancelling={cancellingOids.has(order.oid)}
												editField={editTarget?.order.oid === order.oid ? editTarget.field : null}
												editValue={editValue}
												editDisabled={
													isModifyLocked ||
													unconfirmedModifyOid !== null ||
													pendingScopes.size > 0 ||
													cancellingOids.has(order.oid)
												}
												editInvalid={editTarget?.order.oid === order.oid && !!modifyValidationError}
												editErrorId={modifyActionErrorId}
												cancelDisabled={isModifyLocked || pendingScopes.size > 0 || cancellingOids.has(order.oid)}
												isEven={i % 2 === 1}
												onToggle={handleToggleOrder}
												onCancel={handleCancelRow}
												onSelectMarket={handleSelectMarket}
												onStartEdit={handleStartEdit}
												onEditValueChange={handleEditValueChange}
												onCancelEdit={handleCancelEdit}
												onConfirmEdit={handleConfirmEdit}
											/>
										);
									})}
								</TableBody>
							</Table>
							<OrdersTableFooter />
						</ScrollArea>
					))}
			</div>
			<CancelAllOrdersModal
				open={cancelAllOpen}
				orderCount={cancelAllSnapshot?.orders.length ?? 0}
				isSubmitting={pendingScopes.has("all")}
				errorMessage={cancelAllOpen ? actionError : null}
				onOpenChange={handleCancelAllOpenChange}
				onConfirm={handleConfirmCancelAll}
			/>
		</div>
	);
}

function OrdersEmptyState() {
	const { t } = useLingui();

	return (
		<div className="flex flex-col items-center gap-2.5 py-14 font-market-close">
			<div className="grid size-11 place-items-center rounded-full bg-market-close-hover text-market-close-subtle">
				<ListIcon className="size-4" aria-hidden="true" />
			</div>
			<span className="text-[13px] font-semibold text-market-close-muted">{t`No open orders.`}</span>
			<span className="text-xs text-market-close-subtle">
				{t`Submitted limit and trigger orders will appear here.`}
			</span>
		</div>
	);
}

interface OrdersTableHeaderProps {
	allSelected: boolean;
	someSelected: boolean;
	disabled: boolean;
	onToggleAll: (value: boolean | "indeterminate") => void;
}

function OrdersTableHeader({ allSelected, someSelected, disabled, onToggleAll }: OrdersTableHeaderProps) {
	const { t } = useLingui();
	const columns: readonly { label: string; className: string; tooltip?: boolean }[] = [
		{ label: t`Type`, className: "w-[84px] text-left" },
		{ label: t`Market`, className: "w-[70px] text-left" },
		{ label: t`Direction`, className: "w-[60px] text-left" },
		{ label: t`Size`, className: "w-[100px] justify-end text-right" },
		{ label: t`Original Size`, className: "w-[84px] justify-end text-right", tooltip: true },
		{ label: t`Order Value`, className: "w-[104px] justify-end text-right" },
		{ label: t`Price`, className: "w-[66px] justify-end text-right" },
		{ label: t`Reduce Only`, className: "w-[52px] text-left", tooltip: true },
		{ label: t`Trigger Condition`, className: "w-auto text-left", tooltip: true },
		{ label: t({ message: "TP/SL", context: "Current orders column" }), className: "w-[76px] text-left" },
		{ label: t`Actions`, className: "w-[88px] justify-end text-right" },
	];

	return (
		<TableHeader className={cn(positionsPanelTableHeaderClass, "block bg-modal [&_tr]:border-t-0")}>
			<TableRow
				className={cn(
					positionsPanelTableHeaderRowClass,
					ordersTableGridClass,
					"group/orders-head h-[33px] items-center border-b border-market-close-stroke-card",
				)}
			>
				<TableHead
					scope="col"
					size="dense"
					className={cn(positionsPanelTableHeadClass, ordersTableHeadClass, "relative w-[126px] text-left")}
				>
					<span
						className={cn(
							"absolute -left-4 top-1/2 z-[1] -translate-y-1/2 transition-opacity duration-[120ms] focus-within:opacity-100 group-hover/orders-head:opacity-100",
							allSelected || someSelected ? "opacity-100" : "opacity-0",
						)}
					>
						<Checkbox
							checked={allSelected}
							indeterminate={someSelected && !allSelected}
							onCheckedChange={onToggleAll}
							aria-label={t`Select all orders`}
							disabled={disabled}
						/>
					</span>
					<span>{t`Time`}</span>
				</TableHead>
				{columns.map((column) => (
					<TableHead
						key={column.label}
						scope="col"
						size="dense"
						className={cn(positionsPanelTableHeadClass, ordersTableHeadClass, column.className, "overflow-hidden")}
					>
						{column.tooltip ? (
							<Tooltip content={column.label}>
								<span className="block min-w-0 max-w-full truncate whitespace-nowrap">{column.label}</span>
							</Tooltip>
						) : (
							<span className="block min-w-0 max-w-full truncate whitespace-nowrap">{column.label}</span>
						)}
					</TableHead>
				))}
			</TableRow>
		</TableHeader>
	);
}

function OrdersTableFooter() {
	const { t } = useLingui();

	return (
		<div className="flex h-[38px] min-w-[1280px] items-center px-5 font-market-close">
			<Link
				to="/portfolio"
				className="border-b border-dashed border-market-close-stroke-control text-xs font-semibold text-market-close-fg transition-all duration-[120ms] hover:border-solid focus-visible:rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
			>
				{t`View all`}
			</Link>
		</div>
	);
}

interface OrderRowProps {
	order: OpenOrder;
	displayName: string;
	szDecimals: number;
	marketType: "perp" | "spot";
	markPx: string;
	quoteSymbol: string;
	isSelected: boolean;
	isCancelling: boolean;
	editField: OpenOrderModifyField | null;
	editValue: string;
	editDisabled: boolean;
	editInvalid: boolean;
	editErrorId?: string;
	cancelDisabled: boolean;
	isEven: boolean;
	onToggle: (orderId: number, value: boolean | "indeterminate") => void;
	onCancel: (orders: OpenOrder[]) => void;
	onSelectMarket: (marketName: string, side: Side) => void;
	onStartEdit: (order: OpenOrder, field: OpenOrderModifyField) => void;
	onEditValueChange: (value: string) => void;
	onCancelEdit: () => void;
	onConfirmEdit: () => void;
}

function OrderRow({
	order,
	displayName,
	szDecimals,
	marketType,
	markPx,
	quoteSymbol,
	isSelected,
	isCancelling,
	editField,
	editValue,
	editDisabled,
	editInvalid,
	editErrorId,
	cancelDisabled,
	isEven,
	onToggle,
	onCancel,
	onSelectMarket,
	onStartEdit,
	onEditValueChange,
	onCancelEdit,
	onConfirmEdit,
}: OrderRowProps) {
	const { t } = useLingui();
	const { getOrderSideLabel, getOrderTypeLabel, getTriggerConditionLabel } = useOrderDisplayLabels();
	const orderTypeLabel = getOrderTypeLabel(order.orderType);
	const isBuy = order.side === "B";
	const isClosePosition = isClosePositionOrder(order);
	const sideLabel = getOrderSideLabel(order.side, order.reduceOnly);
	const modifyCapabilities = getOpenOrderModifyCapabilities(order);
	const metrics = getToolbarOrderMetrics({
		isTrigger: order.isTrigger,
		limitPx: order.limitPx,
		triggerPx: order.triggerPx,
		sz: order.sz,
		markPx,
	});
	const markDistanceLabel = metrics.markDistanceRatio
		? formatPercent(metrics.markDistanceRatio, { decimals: 1, signDisplay: "exceptZero" })
		: null;
	const isNearMark = isToolbarOrderNearMark(metrics.markDistanceRatio);
	const triggerConditionLabel =
		order.isTrigger && order.triggerCondition
			? (getCurrentOrderTriggerConditionLabel(order.triggerCondition, order.triggerPx) ??
				getTriggerConditionLabel(order.triggerCondition))
			: FALLBACK_VALUE_PLACEHOLDER;
	const takeProfitPx = order.children.find(isTakeProfitOrder)?.triggerPx;
	const stopLossPx = order.children.find(isStopOrder)?.triggerPx;
	const tpSlLabel = `${formatPrice(takeProfitPx, { szDecimals, marketType })} / ${formatPrice(stopLossPx, { szDecimals, marketType })}`;
	const sizeLabel = isClosePosition ? t`Close Position` : formatToken(order.sz, { decimals: szDecimals });
	const originalSizeLabel = isClosePosition ? t`Close Position` : formatToken(order.origSz, { decimals: szDecimals });
	const remainingValueLabel =
		quoteSymbol === DEFAULT_QUOTE_TOKEN
			? formatUSD(metrics.remainingValue, { compact: true })
			: formatQuoteAmount(metrics.remainingValue, quoteSymbol, { compact: true, decimals: 2 });

	return (
		<TableRow
			className={cn(
				positionsPanelRowHoverClass,
				ordersTableGridClass,
				"group/order-row h-[60px] items-center border-b border-market-close-stroke-card/60 transition-colors duration-[120ms] hover:bg-market-close-hover",
				isEven && positionsPanelRowStripeClass,
			)}
		>
			<TableCell
				size="dense"
				className={cn(
					positionsPanelTableCellClass,
					ordersTableCellClass,
					"relative whitespace-nowrap text-xs text-market-close-muted tabular-nums",
				)}
			>
				<span
					className={cn(
						"absolute -left-4 top-1/2 z-[1] -translate-y-1/2 transition-opacity duration-[120ms] focus-within:opacity-100 group-hover/order-row:opacity-100",
						isSelected ? "opacity-100" : "opacity-0",
					)}
				>
					<Checkbox
						checked={isSelected}
						onCheckedChange={(value) => onToggle(order.oid, value)}
						aria-label={`${t`Select order`} ${order.coin}`}
						disabled={isCancelling}
					/>
				</span>
				<span>{formatDateTime(order.timestamp, { dateStyle: "short", timeStyle: "short" })}</span>
			</TableCell>
			<TableCell size="dense" className={cn(positionsPanelTableCellClass, ordersTableCellClass)}>
				<Tooltip content={orderTypeLabel}>
					<span className="block max-w-full truncate whitespace-nowrap text-[13px] text-market-close-fg">
						{orderTypeLabel}
					</span>
				</Tooltip>
			</TableCell>
			<TableCell size="dense" className={cn(positionsPanelTableCellClass, ordersTableCellClass, "font-bold")}>
				<button
					type="button"
					className="max-w-full truncate rounded-[4px] text-left text-[13px] font-bold text-market-close-fg transition-colors duration-[120ms] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
					onClick={() => onSelectMarket(order.coin, isBuy ? "buy" : "sell")}
					aria-label={t`Switch to ${order.coin} market, ${sideLabel} order`}
				>
					{displayName}
				</button>
			</TableCell>
			<TableCell
				size="dense"
				className={cn(
					positionsPanelTableCellClass,
					ordersTableCellClass,
					"truncate whitespace-nowrap font-semibold",
					isBuy ? "text-market-close-success" : "text-market-close-danger",
				)}
			>
				{sideLabel}
			</TableCell>
			<TableCell
				size="dense"
				className={cn(positionsPanelTableCellClass, ordersTableCellClass, "justify-end text-right")}
			>
				<div className="relative flex min-w-0 items-center justify-end gap-1">
					{editField === "size" ? (
						<>
							<span className="h-[33px] w-full" aria-hidden="true" />
							<OrderInlineEdit
								value={editValue}
								inputLabel={t`Edit ${order.coin} order size`}
								confirmLabel={t`Confirm order size change`}
								confirmText={t`Confirm`}
								describedBy={editInvalid ? editErrorId : undefined}
								disabled={editDisabled}
								invalid={editInvalid}
								onChange={onEditValueChange}
								onCancel={onCancelEdit}
								onConfirm={onConfirmEdit}
							/>
						</>
					) : (
						<>
							<Tooltip content={sizeLabel}>
								<span className="min-w-0 truncate whitespace-nowrap font-semibold leading-tight tabular-nums">
									{sizeLabel}
								</span>
							</Tooltip>
							{modifyCapabilities.size.supported ? (
								<button
									id={getOrderEditTriggerId(order.oid, "size")}
									type="button"
									className="inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] text-market-close-subtle transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:opacity-50"
									aria-label={t`Edit ${order.coin} order size`}
									disabled={editDisabled}
									onClick={() => onStartEdit(order, "size")}
								>
									<PencilIcon className="size-2.5" aria-hidden="true" />
								</button>
							) : null}
						</>
					)}
				</div>
			</TableCell>
			<TableCell
				size="dense"
				className={cn(positionsPanelTableCellClass, ordersTableCellClass, "justify-end text-right")}
			>
				<Tooltip content={originalSizeLabel}>
					<span className="min-w-0 truncate whitespace-nowrap tabular-nums">{originalSizeLabel}</span>
				</Tooltip>
			</TableCell>
			<TableCell
				size="dense"
				className={cn(
					positionsPanelTableCellClass,
					ordersTableCellClass,
					"justify-end whitespace-nowrap text-right tabular-nums",
				)}
			>
				{isClosePosition ? FALLBACK_VALUE_PLACEHOLDER : remainingValueLabel}
			</TableCell>
			<TableCell
				size="dense"
				className={cn(positionsPanelTableCellClass, ordersTableCellClass, "justify-end text-right tabular-nums")}
			>
				<span className="font-semibold leading-tight tabular-nums">
					{isMarketTriggerOrder(order) ? t`Market` : formatPrice(order.limitPx, { szDecimals, marketType })}
				</span>
			</TableCell>
			<TableCell
				size="dense"
				className={cn(positionsPanelTableCellClass, ordersTableCellClass, "overflow-hidden whitespace-nowrap")}
			>
				{order.reduceOnly ? t`Yes` : t`No`}
			</TableCell>
			<TableCell
				size="dense"
				className={cn(positionsPanelTableCellClass, ordersTableCellClass, "text-market-close-muted")}
			>
				{editField === "triggerPrice" ? (
					<div className="relative flex min-w-0">
						<span className="h-[33px] w-full" aria-hidden="true" />
						<OrderInlineEdit
							value={editValue}
							inputLabel={t`Edit ${order.coin} trigger price`}
							confirmLabel={t`Confirm trigger price change`}
							confirmText={t`Confirm`}
							describedBy={editInvalid ? editErrorId : undefined}
							align="left"
							disabled={editDisabled}
							invalid={editInvalid}
							onChange={onEditValueChange}
							onCancel={onCancelEdit}
							onConfirm={onConfirmEdit}
						/>
					</div>
				) : (
					<div className="flex min-w-0 flex-col gap-px">
						<div className="flex min-w-0 items-center gap-1">
							<Tooltip content={triggerConditionLabel}>
								<span className="truncate whitespace-nowrap tabular-nums text-market-close-fg">
									{triggerConditionLabel}
								</span>
							</Tooltip>
							{modifyCapabilities.triggerPrice.supported ? (
								<button
									id={getOrderEditTriggerId(order.oid, "triggerPrice")}
									type="button"
									className="inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] text-market-close-subtle transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:opacity-50"
									aria-label={t`Edit ${order.coin} trigger price`}
									disabled={editDisabled}
									onClick={() => onStartEdit(order, "triggerPrice")}
								>
									<PencilIcon className="size-2.5" aria-hidden="true" />
								</button>
							) : null}
						</div>
						{order.isTrigger && markDistanceLabel ? (
							<span
								className={cn(
									"whitespace-nowrap text-[11px] tabular-nums",
									isNearMark ? "text-market-close-warning" : "text-market-close-subtle",
								)}
							>
								{t`Distance to mark ${markDistanceLabel}`}
							</span>
						) : null}
					</div>
				)}
			</TableCell>
			<TableCell
				size="dense"
				className={cn(
					positionsPanelTableCellClass,
					ordersTableCellClass,
					"whitespace-nowrap text-market-close-subtle tabular-nums",
				)}
			>
				{tpSlLabel}
			</TableCell>
			<TableCell
				size="dense"
				className={cn(positionsPanelTableCellClass, ordersTableCellClass, "justify-end text-right")}
			>
				<Button
					variant="outline"
					size="xs"
					aria-label={t`Cancel order`}
					onClick={() => onCancel([order])}
					disabled={isCancelling || cancelDisabled}
					className="h-[27px] min-h-0 rounded-[7px] border-market-close-stroke-input bg-modal px-3 text-xs font-semibold text-market-close-fg shadow-none transition-colors duration-[120ms] hover:border-market-close-danger hover:bg-modal hover:text-market-close-danger focus-visible:border-market-close-control focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-market-close-control active:not-data-disabled:scale-100 disabled:cursor-not-allowed"
				>
					{isCancelling ? t`Canceling...` : t`Cancel`}
				</Button>
			</TableCell>
		</TableRow>
	);
}
