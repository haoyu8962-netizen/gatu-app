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
import { useLingui } from "@lingui/react/macro";
import { PencilIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { FALLBACK_VALUE_PLACEHOLDER, HL_ALL_DEXS } from "@/config/app";
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
	matchesToolbarOrderFilters,
	type ToolbarOrderDirectionFilter,
	type ToolbarOrderTypeFilter,
} from "@/domain/trade/trading-toolbar-metrics";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatDateTime, formatPercent, formatPrice, formatToken, formatUSD } from "@/lib/format";
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
	getOrderTypeConfig,
	isClosePositionOrder,
	isMarketTriggerOrder,
	isStopOrder,
	isTakeProfitOrder,
	type OpenOrder,
} from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { AssetBadge } from "../components/asset-badge";
import { CancelAllOrdersModal } from "./cancel-all-orders-modal";
import { OrderInlineEdit } from "./order-inline-edit";
import { Placeholder } from "./placeholder";
import {
	positionsPanelRowHoverClass,
	positionsPanelRowStripeClass,
	positionsPanelTableBodyClass,
	positionsPanelTableCaptionRowClass,
	positionsPanelTableCellClass,
	positionsPanelTableHeadClass,
	positionsPanelTableHeaderClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";

type CancelScope = "row" | "selected" | "all";
const MODIFY_SUBSCRIPTION_TIMEOUT_MS = 15_000;

interface CancelCallbacks {
	onSuccess?: () => void;
	onSettled?: () => void;
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

export function OrdersTab() {
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
	const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(() => new Set());
	const [cancellingOids, setCancellingOids] = useState<Set<number>>(() => new Set());
	const [pendingScopes, setPendingScopes] = useState<Set<CancelScope>>(() => new Set());
	const [cancelAllOpen, setCancelAllOpen] = useState(false);
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
	const editTargetRef = useRef<OpenOrderModifyTarget | null>(null);
	const editValueRef = useRef("");
	const modifyPhaseRef = useRef<ModifyPhase>("idle");
	const modifyExecutionRef = useRef<ModifyExecutionContext | null>(null);
	const unconfirmedExecutionRef = useRef<ModifyExecutionContext | null>(null);
	const mountedRef = useRef(false);

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

	const { mutate: cancelOrders, error: cancelError, reset: resetCancelError } = useExchange("cancel");
	const {
		mutateAsync: modifyOrders,
		error: modifyError,
		reset: resetModifyError,
	} = useExchange("batchModify", { executionGuard: assertModifyExecution });

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
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

	const selectedCount = validSelectedIds.size;
	const displayedSelectedCount = displayedOrders.reduce(
		(count, order) => count + (validSelectedIds.has(order.oid) ? 1 : 0),
		0,
	);
	const allSelected = displayedOrders.length > 0 && displayedSelectedCount === displayedOrders.length;
	const someSelected = displayedSelectedCount > 0 && displayedSelectedCount < displayedOrders.length;

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
		if (ordersToCancel.length === 0 || modifyPhaseRef.current !== "idle") return false;
		setCancelValidationError(null);

		const fresh = ordersToCancel.filter((order) => !cancellingOids.has(order.oid));
		if (fresh.length === 0) return false;

		const cancels = fresh.reduce<{ a: number; o: number }[]>((acc, order) => {
			const assetId = markets.getAssetId(order.coin);
			if (typeof assetId !== "number") return acc;
			acc.push({ a: assetId, o: order.oid });
			return acc;
		}, []);

		if (cancels.length !== fresh.length) {
			setCancelValidationError(t`Some order markets are unavailable. Refresh and try again.`);
			return false;
		}

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
		cancelOrders(
			{ cancels },
			{
				onSuccess: () => {
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
			},
		);
		return true;
	}

	function handleCancelRow(ordersToCancel: OpenOrder[]) {
		handleCancel(ordersToCancel, "row");
	}

	function handleCancelSelected() {
		const ordersToCancel = openOrders.filter((order) => validSelectedIds.has(order.oid));
		handleCancel(ordersToCancel, "selected");
	}

	function handleRequestCancelAll() {
		if (openOrders.length === 0 || pendingScopes.has("all") || cancelAllSubmittingRef.current) return;
		resetCancelError();
		setCancelValidationError(null);
		setCancelAllOpen(true);
	}

	function handleConfirmCancelAll() {
		if (cancelAllSubmittingRef.current || pendingScopes.has("all")) return;
		cancelAllSubmittingRef.current = true;
		const started = handleCancel(openOrders, "all", {
			onSuccess: () => setCancelAllOpen(false),
			onSettled: () => {
				cancelAllSubmittingRef.current = false;
			},
		});
		if (!started) cancelAllSubmittingRef.current = false;
	}

	function handleCancelAllOpenChange(open: boolean) {
		if (cancelAllSubmittingRef.current || pendingScopes.has("all")) return;
		setCancelAllOpen(open);
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
		if (!execution || status !== "active" || isStale) return;

		function finishReconciliation() {
			editTargetRef.current = null;
			editValueRef.current = "";
			modifyExecutionRef.current = null;
			unconfirmedExecutionRef.current = null;
			modifyPhaseRef.current = "idle";
			setEditTarget(null);
			setEditValue("");
			setModifyValidationError(null);
			setModifyPhaseState("idle");
			setUnconfirmedModifyOid(null);
		}

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
	}, [modifyPhase, openOrders, status, isStale, t]);

	const isModifyLocked = modifyPhase !== "idle";
	const disableCancelSelected = pendingScopes.has("selected") || selectedCount === 0 || isModifyLocked;
	const disableCancelAll = pendingScopes.has("all") || openOrders.length === 0 || isModifyLocked;
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
		if (openOrders.length === 0) return <Placeholder>{t`No open orders.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTabRootClass}>
			<div className={cn(positionsPanelTableCaptionRowClass, "min-h-9 flex-wrap")}>
				<Select
					size="xxs"
					value={orderTypeFilter}
					onValueChange={(value) => setOrderTypeFilter((value as ToolbarOrderTypeFilter | null) ?? "all")}
					options={[
						{ value: "all", label: t`All Types` },
						{ value: "limit", label: t`Limit` },
						{ value: "trigger", label: t`Trigger` },
					]}
					triggerClassName="min-w-[6.5rem] !rounded-[7px] border-market-close-stroke-card bg-surface"
					className="mr-auto"
				/>
				<Select
					size="xxs"
					value={orderDirectionFilter}
					onValueChange={(value) => setOrderDirectionFilter((value as ToolbarOrderDirectionFilter | null) ?? "all")}
					options={[
						{ value: "all", label: t`All Directions` },
						{ value: "buy", label: t`Buy` },
						{ value: "sell", label: t`Sell` },
					]}
					triggerClassName="min-w-[7rem] !rounded-[7px] border-market-close-stroke-card bg-surface"
				/>
				{isConnected ? (
					<span className="tabular-nums text-3xs text-fg-muted">
						{openOrders.length} {t`orders`}
					</span>
				) : null}
				{isConnected && selectedCount > 0 ? (
					<span className="tabular-nums text-3xs text-fg-muted">
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
					>
						{pendingScopes.has("all") ? t`Canceling...` : t`Cancel all`}
					</Button>
				) : null}
			</div>
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
						<Placeholder>{t`No orders match the selected filters.`}</Placeholder>
					) : (
						<ScrollArea className="h-full w-full">
							<Table className="table-fixed min-w-[80rem] w-full">
								<TableHeader className={positionsPanelTableHeaderClass}>
									<TableRow className={positionsPanelTableHeaderRowClass}>
										<TableHead
											scope="col"
											size="dense"
											className={cn(positionsPanelTableHeadClass, "w-32 px-2 text-left")}
										>
											<span className="inline-flex items-center gap-2">
												<Checkbox
													checked={allSelected}
													indeterminate={someSelected && !allSelected}
													onCheckedChange={handleToggleAll}
													aria-label={t`Select all orders`}
													disabled={displayedOrders.length === 0}
												/>
												<span>{t`Time`}</span>
											</span>
										</TableHead>
										<TableHead
											scope="col"
											size="dense"
											className={cn(positionsPanelTableHeadClass, "w-24 px-2 text-left")}
										>
											{t`Type`}
										</TableHead>
										<TableHead
											scope="col"
											size="dense"
											className={cn(positionsPanelTableHeadClass, "w-24 px-2 text-left")}
										>
											{t`Market`}
										</TableHead>
										<TableHead
											scope="col"
											size="dense"
											className={cn(positionsPanelTableHeadClass, "w-20 px-2 text-left")}
										>
											{t`Direction`}
										</TableHead>
										<TableHead
											scope="col"
											size="dense"
											className={cn(positionsPanelTableHeadClass, "w-36 px-2 text-right")}
										>
											{t`Size`}
										</TableHead>
										<TableHead
											scope="col"
											size="dense"
											className={cn(positionsPanelTableHeadClass, "w-24 px-2 text-right")}
										>
											{t`Original Size`}
										</TableHead>
										<TableHead
											scope="col"
											size="dense"
											className={cn(positionsPanelTableHeadClass, "w-28 px-2 text-right")}
										>
											{t`Order Value`}
										</TableHead>
										<TableHead
											scope="col"
											size="dense"
											className={cn(positionsPanelTableHeadClass, "w-24 px-2 text-right")}
										>
											{t`Price`}
										</TableHead>
										<TableHead
											scope="col"
											size="dense"
											className={cn(positionsPanelTableHeadClass, "w-20 px-2 text-left")}
										>
											{t`Reduce Only`}
										</TableHead>
										<TableHead
											scope="col"
											size="dense"
											className={cn(positionsPanelTableHeadClass, "w-48 px-2 text-left")}
										>
											{t`Trigger Condition`}
										</TableHead>
										<TableHead
											scope="col"
											size="dense"
											className={cn(positionsPanelTableHeadClass, "w-32 px-2 text-left")}
										>
											{t`TP/SL`}
										</TableHead>
										<TableHead
											scope="col"
											size="dense"
											className={cn(positionsPanelTableHeadClass, "w-20 px-2 text-right")}
										>
											{t`Actions`}
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody className={positionsPanelTableBodyClass}>
									{displayedOrders.map((order, i) => {
										const marketInfo = getMarketInfo(order.coin);
										return (
											<OrderRow
												key={order.oid}
												order={order}
												szDecimals={markets.getSzDecimals(order.coin)}
												markPx={marketInfo?.markPx ?? ""}
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
							<ScrollBar orientation="horizontal" />
						</ScrollArea>
					))}
			</div>
			<CancelAllOrdersModal
				open={cancelAllOpen}
				orderCount={openOrders.length}
				isSubmitting={pendingScopes.has("all")}
				errorMessage={cancelAllOpen ? actionError : null}
				onOpenChange={handleCancelAllOpenChange}
				onConfirm={handleConfirmCancelAll}
			/>
		</div>
	);
}

interface OrderRowProps {
	order: OpenOrder;
	szDecimals: number;
	markPx: string;
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
	szDecimals,
	markPx,
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
	const {
		getExecutionKindLabel,
		getFullOrderTypeLabel,
		getOrderSideLabel,
		getTriggerConditionLabel,
		getTriggerKindLabel,
	} = useOrderDisplayLabels();
	const typeConfig = getOrderTypeConfig(order);
	const triggerLabel = getTriggerKindLabel(typeConfig.triggerKind);
	const executionLabel = getExecutionKindLabel(typeConfig.executionKind);
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
		? formatPercent(metrics.markDistanceRatio, { decimals: 1, signDisplay: "never" })
		: null;
	const isNearMark = toBig(metrics.markDistanceRatio)?.lt("0.1") ?? false;
	const triggerConditionLabel =
		order.isTrigger && order.triggerCondition
			? getTriggerConditionLabel(order.triggerCondition)
			: FALLBACK_VALUE_PLACEHOLDER;
	const takeProfitPx = order.children.find(isTakeProfitOrder)?.triggerPx;
	const stopLossPx = order.children.find(isStopOrder)?.triggerPx;
	const tpSlLabel = `${formatPrice(takeProfitPx, { szDecimals })} / ${formatPrice(stopLossPx, { szDecimals })}`;

	return (
		<TableRow className={cn(positionsPanelRowHoverClass, isEven && positionsPanelRowStripeClass)}>
			<TableCell
				size="dense"
				className={cn(positionsPanelTableCellClass, "px-2 whitespace-nowrap tabular-nums text-fg-muted")}
			>
				<span className="inline-flex items-center gap-2">
					<Checkbox
						checked={isSelected}
						onCheckedChange={(value) => onToggle(order.oid, value)}
						aria-label={`${t`Select order`} ${order.coin}`}
						disabled={isCancelling}
					/>
					<span>{formatDateTime(order.timestamp, { dateStyle: "short", timeStyle: "short" })}</span>
				</span>
			</TableCell>
			<TableCell size="dense" className={cn(positionsPanelTableCellClass, "px-2 text-fg")}>
				<Tooltip content={getFullOrderTypeLabel(order)}>
					<span className="inline-flex items-baseline gap-1 text-xs whitespace-nowrap">
						{triggerLabel ? <span className={cn("font-medium", typeConfig.triggerClass)}>{triggerLabel}</span> : null}
						<span className="text-fg">{executionLabel}</span>
					</span>
				</Tooltip>
			</TableCell>
			<TableCell size="dense" className={cn(positionsPanelTableCellClass, "px-2 font-medium text-fg")}>
				<AssetBadge
					coin={order.coin}
					side={isBuy ? "buy" : "sell"}
					onClick={() => onSelectMarket(order.coin, isBuy ? "buy" : "sell")}
					aria-label={t`Switch to ${order.coin} market, ${sideLabel} order`}
				/>
			</TableCell>
			<TableCell
				size="dense"
				className={cn(
					positionsPanelTableCellClass,
					"px-2 whitespace-nowrap text-xs font-semibold",
					isBuy ? "text-success" : "text-error",
				)}
			>
				{sideLabel}
			</TableCell>
			<TableCell size="dense" className={cn(positionsPanelTableCellClass, "px-2 text-right text-fg")}>
				<div className="flex min-w-0 items-center justify-end gap-1">
					{editField === "size" ? (
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
					) : (
						<>
							<span className="min-w-0 truncate text-xs font-semibold tabular-nums leading-tight">
								{isClosePosition ? t`Close Position` : formatToken(order.sz, { decimals: szDecimals })}
							</span>
							{modifyCapabilities.size.supported ? (
								<button
									type="button"
									className="inline-flex size-4 shrink-0 items-center justify-center rounded-4 text-fg-muted transition-colors duration-150 hover:bg-fill-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stroke-focus disabled:cursor-not-allowed disabled:opacity-50"
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
			<TableCell size="dense" className={cn(positionsPanelTableCellClass, "px-2 text-right text-fg")}>
				<span className="text-xs tabular-nums whitespace-nowrap">
					{isClosePosition ? t`Close Position` : formatToken(order.origSz, { decimals: szDecimals })}
				</span>
			</TableCell>
			<TableCell
				size="dense"
				className={cn(positionsPanelTableCellClass, "px-2 text-right text-xs tabular-nums whitespace-nowrap text-fg")}
			>
				{isClosePosition ? FALLBACK_VALUE_PLACEHOLDER : formatUSD(metrics.remainingValue, { compact: true })}
			</TableCell>
			<TableCell size="dense" className={cn(positionsPanelTableCellClass, "px-2 text-right tabular-nums text-fg")}>
				<span className="text-xs font-semibold tabular-nums leading-tight">
					{isMarketTriggerOrder(order) ? t`Market` : formatPrice(order.limitPx, { szDecimals })}
				</span>
			</TableCell>
			<TableCell size="dense" className={cn(positionsPanelTableCellClass, "px-2 whitespace-nowrap text-xs text-fg")}>
				{order.reduceOnly ? t`Yes` : t`No`}
			</TableCell>
			<TableCell size="dense" className={cn(positionsPanelTableCellClass, "px-2 text-fg-muted")}>
				{editField === "triggerPrice" ? (
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
				) : (
					<div className="flex min-w-0 flex-col gap-px">
						<div className="flex min-w-0 items-center gap-1">
							<span className="truncate text-xs tabular-nums text-fg">{triggerConditionLabel}</span>
							{modifyCapabilities.triggerPrice.supported ? (
								<button
									type="button"
									className="inline-flex size-4 shrink-0 items-center justify-center rounded-4 text-fg-muted transition-colors duration-150 hover:bg-fill-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stroke-focus disabled:cursor-not-allowed disabled:opacity-50"
									aria-label={t`Edit ${order.coin} trigger price`}
									disabled={editDisabled}
									onClick={() => onStartEdit(order, "triggerPrice")}
								>
									<PencilIcon className="size-2.5" aria-hidden="true" />
								</button>
							) : null}
						</div>
						{markDistanceLabel ? (
							<span
								className={cn("whitespace-nowrap text-2xs tabular-nums", isNearMark ? "text-warning" : "text-fg-muted")}
							>
								{t`Distance to mark ${markDistanceLabel}`}
							</span>
						) : null}
					</div>
				)}
			</TableCell>
			<TableCell
				size="dense"
				className={cn(positionsPanelTableCellClass, "px-2 whitespace-nowrap text-xs tabular-nums text-fg-muted")}
			>
				{tpSlLabel}
			</TableCell>
			<TableCell size="dense" className={cn(positionsPanelTableCellClass, "px-2 text-right")}>
				<Button
					variant="link"
					size="xs"
					aria-label={t`Cancel order`}
					onClick={() => onCancel([order])}
					disabled={isCancelling || cancelDisabled}
				>
					{isCancelling ? t`Canceling...` : t`Cancel`}
				</Button>
			</TableCell>
		</TableRow>
	);
}
