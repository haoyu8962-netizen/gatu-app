import { Button, Select } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ListIcon, ListNumbersIcon, XIcon } from "@phosphor-icons/react";
import { Skeleton } from "boneyard-js/react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { FALLBACK_VALUE_PLACEHOLDER, HL_ALL_DEXS } from "@/config/app";
import {
	type CancelAllConfirmationBlockReason,
	type CancelAllConfirmationSnapshot,
	createCancelAllConfirmationSnapshot,
	validateCancelAllConfirmationSnapshot,
} from "@/domain/trade/cancel-all-orders-confirmation";
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
import { formatDateTime, formatPercent, formatPrice, formatToken } from "@/lib/format";
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
import { isClosePositionOrder, isMarketTriggerOrder, type OpenOrder } from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { CancelAllOrdersModal } from "../positions/cancel-all-orders-modal";
import { MobileDisclosureHeader } from "./mobile-disclosure-header";
import { MobileOrderModificationModal } from "./mobile-order-modification-modal";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { useMobileDisclosureSet } from "./use-mobile-disclosure-set";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

interface Props {
	className?: string;
	scrollMode?: MobileDataScrollMode;
}

type CancelScope = "row" | "all";
type ModifyPhase = "idle" | "submitting" | "awaiting";
const MODIFY_SUBSCRIPTION_TIMEOUT_MS = 15_000;

interface CancelCallbacks {
	onSuccess?: () => void;
	onSettled?: () => void;
}

interface CancelAllDialogSnapshot {
	confirmation: CancelAllConfirmationSnapshot;
	orders: readonly OpenOrder[];
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
	target: OpenOrderModifyFormTarget;
	size: string;
	triggerPrice?: string;
	normalizedSize: string;
	normalizedTriggerPrice: string | null;
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

interface MobileOrderBulkDetailsActionsProps {
	orderKeys: readonly string[];
	expandedOrderKeys: ReadonlySet<string>;
	onExpandAll: () => void;
	onCollapseAll: () => void;
}

const mobileOrderBulkActionClass =
	"relative min-h-0 whitespace-nowrap p-0 text-xs leading-4 transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:text-fg-disabled";

export function MobileOrderBulkDetailsActions({
	orderKeys,
	expandedOrderKeys,
	onExpandAll,
	onCollapseAll,
}: MobileOrderBulkDetailsActionsProps) {
	const { t } = useLingui();
	const canExpand = orderKeys.some((key) => !expandedOrderKeys.has(key));
	const canCollapse = orderKeys.some((key) => expandedOrderKeys.has(key));

	return (
		<div data-testid="mobile-order-bulk-details-actions" className="flex shrink-0 items-center gap-3">
			<button
				type="button"
				data-testid="expand-all-order-details"
				onClick={onExpandAll}
				disabled={!canExpand}
				className={cn(mobileOrderBulkActionClass, "font-semibold text-market-close-fg")}
			>
				{t`Expand all`}
			</button>
			<button
				type="button"
				data-testid="collapse-all-order-details"
				onClick={onCollapseAll}
				disabled={!canCollapse}
				className={cn(mobileOrderBulkActionClass, "font-normal text-market-close-muted")}
			>
				{t`Collapse all`}
			</button>
		</div>
	);
}

export function MobileOrdersTab({ className, scrollMode = "contained" }: Props) {
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
		error,
		isStale,
	} = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);

	const { mutate: cancelOrders, error: cancelError, reset: resetCancelError } = useExchange("cancel");
	const { clientKey, env } = useHyperliquid();
	const { getMarketInfo } = useMarketsInfo();

	const [cancellingOids, setCancellingOids] = useState<Set<number>>(() => new Set());
	const [pendingScopes, setPendingScopes] = useState<Set<CancelScope>>(() => new Set());
	const [cancelAllOpen, setCancelAllOpen] = useState(false);
	const [cancelAllSnapshot, setCancelAllSnapshot] = useState<CancelAllDialogSnapshot | null>(null);
	const [cancelValidationError, setCancelValidationError] = useState<string | null>(null);
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
	const [modifyValidationError, setModifyValidationError] = useState<string | null>(null);
	const [unconfirmedModifyOid, setUnconfirmedModifyOid] = useState<number | null>(null);
	const cancelAllSubmittingRef = useRef(false);
	const modifyTargetRef = useRef<OpenOrderModifyFormTarget | null>(null);
	const modifySizeRef = useRef("");
	const modifyTriggerPriceRef = useRef<string | undefined>(undefined);
	const modifyPhaseRef = useRef<ModifyPhase>("idle");
	const modifyExecutionRef = useRef<ModifyExecutionContext | null>(null);
	const unconfirmedExecutionRef = useRef<ModifyExecutionContext | null>(null);
	const mountedRef = useRef(false);

	const openOrders = openOrdersEvent?.orders ?? [];
	const isPageScroll = scrollMode === "page";
	const displayedOrders = openOrders.filter((order) => matchesToolbarOrderFilters(order, typeFilter, directionFilter));
	const orderKeys = displayedOrders.map((order) => `${order.coin}:${order.oid}`);
	const {
		expandedKeys: expandedOrderKeys,
		setExpanded: setOrderExpanded,
		expandAll: expandAllOrders,
		collapseAll: collapseAllOrders,
	} = useMobileDisclosureSet(`${env}:${address?.toLowerCase() ?? "disconnected"}`, orderKeys);

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
			throw new Error(t`Trading data changed before the order modification could be submitted.`);
		}
		const currentPlan = buildPlanFromLive(execution.target, execution.size, execution.triggerPrice);
		if (currentPlan.status === "blocked") throw new Error(getModifyBlockMessage(currentPlan.reason));
		if (
			!openOrderModifyParamsEqual(currentPlan.params, execution.params) ||
			!openOrderModifyParamsEqual(params, execution.params)
		) {
			throw new Error(t`Trading data changed before the order modification could be submitted.`);
		}
	}

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

	function clearModifyModal() {
		modifyTargetRef.current = null;
		modifySizeRef.current = "";
		modifyTriggerPriceRef.current = undefined;
		modifyExecutionRef.current = null;
		setModifyTarget(null);
		setModifySize("");
		setModifyTriggerPrice(undefined);
		setModifyValidationError(null);
		setModifyPhase("idle");
	}

	function handleRequestModify(order: OpenOrder) {
		if (
			modifyPhaseRef.current !== "idle" ||
			unconfirmedExecutionRef.current ||
			pendingScopes.size > 0 ||
			cancellingOids.has(order.oid)
		) {
			return;
		}
		const market = getMarketBinding(order.coin);
		if (!market) {
			setModifyValidationError(getModifyBlockMessage("invalid-market-binding"));
			return;
		}
		const result = createOpenOrderModifyFormTarget({ owner: clientKey, env, market, order });
		if (result.status === "blocked") {
			setModifyValidationError(getModifyBlockMessage(result.reason));
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

	function handleModifyOpenChange(open: boolean) {
		if (open || modifyPhaseRef.current !== "idle") return;
		clearModifyModal();
		resetModifyError();
	}

	function handleModifySizeChange(value: string) {
		if (modifyPhaseRef.current !== "idle" || unconfirmedExecutionRef.current) return;
		modifySizeRef.current = value;
		setModifySize(value);
		setModifyValidationError(null);
		resetModifyError();
	}

	function handleModifyTriggerPriceChange(value: string) {
		if (modifyPhaseRef.current !== "idle" || unconfirmedExecutionRef.current) return;
		modifyTriggerPriceRef.current = value;
		setModifyTriggerPrice(value);
		setModifyValidationError(null);
		resetModifyError();
	}

	async function handleConfirmModify() {
		if (modifyPhaseRef.current !== "idle" || unconfirmedExecutionRef.current) return;
		const target = modifyTargetRef.current;
		if (!target) return;
		const size = modifySizeRef.current;
		const triggerPrice = modifyTriggerPriceRef.current;
		const plan = buildPlanFromLive(target, size, triggerPrice);
		if (plan.status === "blocked") {
			setModifyValidationError(getModifyBlockMessage(plan.reason));
			return;
		}

		const execution: ModifyExecutionContext = {
			target,
			size,
			triggerPrice,
			normalizedSize: plan.normalizedSize,
			normalizedTriggerPrice: plan.normalizedTriggerPrice,
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
				live.clientKey.toLowerCase() !== execution.target.size.owner ||
				live.snapshotOwner.toLowerCase() !== execution.target.size.owner ||
				live.env !== execution.target.size.env
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
			modifyPhaseRef.current = "idle";
			setUnconfirmedModifyOid(execution.target.size.order.oid);
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
			modifyTargetRef.current = null;
			modifySizeRef.current = "";
			modifyTriggerPriceRef.current = undefined;
			modifyExecutionRef.current = null;
			unconfirmedExecutionRef.current = null;
			modifyPhaseRef.current = "idle";
			setModifyTarget(null);
			setModifySize("");
			setModifyTriggerPrice(undefined);
			setModifyValidationError(null);
			setModifyPhaseState("idle");
			setUnconfirmedModifyOid(null);
		}

		const matches = openOrders.filter((order) => order.oid === execution.target.size.order.oid);
		if (matches.length === 0) {
			toast.info(t`The modified order is no longer open.`);
			finishReconciliation();
			return;
		}
		if (matches.length !== 1) {
			toast.error(t`This order changed or is no longer open. Refresh and try again.`);
			finishReconciliation();
			return;
		}

		const latest = matches[0];
		if (!latest) return;
		const sizeMatches = toBig(latest.sz)?.eq(execution.normalizedSize) ?? false;
		const triggerMatches =
			execution.normalizedTriggerPrice === null ||
			(toBig(latest.triggerPx)?.eq(execution.normalizedTriggerPrice) ?? false);
		if (sizeMatches && triggerMatches) {
			toast.success(t`Order modification confirmed.`);
			finishReconciliation();
			return;
		}

		const originalSizeChanged = !(toBig(latest.sz)?.eq(execution.target.size.order.sz) ?? false);
		const originalTriggerChanged =
			execution.target.triggerPrice !== null &&
			!(toBig(latest.triggerPx)?.eq(execution.target.triggerPrice.order.triggerPx) ?? false);
		if (originalSizeChanged || originalTriggerChanged) {
			toast.error(
				t`The order changed before the requested modification was confirmed. Review the latest order before retrying.`,
			);
			finishReconciliation();
		}
	}, [modifyPhase, openOrders, status, isStale, t]);

	function handleCancel(ordersToCancel: OpenOrder[], nextScope: CancelScope, callbacks?: CancelCallbacks): boolean {
		if (ordersToCancel.length === 0 || modifyPhaseRef.current !== "idle") return false;
		setCancelValidationError(null);

		const fresh = ordersToCancel.filter((order) => !cancellingOids.has(order.oid));
		if (fresh.length === 0) return false;
		if (nextScope === "all" && fresh.length !== ordersToCancel.length) {
			setCancelValidationError(t`Open orders changed. Reopen the confirmation and try again.`);
			return false;
		}

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
				onSuccess: () => callbacks?.onSuccess?.(),
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
			setCancelValidationError(getCancelAllBlockMessage(result.reason));
			return;
		}
		setCancelAllSnapshot({ confirmation: result.snapshot, orders: [...openOrders] });
		setCancelAllOpen(true);
	}

	function handleConfirmCancelAll() {
		if (cancelAllSubmittingRef.current || pendingScopes.size > 0 || modifyPhaseRef.current !== "idle") return;
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
		if (cancelAllSubmittingRef.current || pendingScopes.size > 0 || modifyPhaseRef.current !== "idle") return;
		setCancelAllOpen(open);
		if (!open) setCancelAllSnapshot(null);
	}

	const headerCount = isConnected ? displayedOrders.length : FALLBACK_VALUE_PLACEHOLDER;
	const draftModifyPlan = modifyTarget ? buildPlanFromLive(modifyTarget, modifySize, modifyTriggerPrice) : null;
	const draftModifyError =
		draftModifyPlan?.status === "blocked" && draftModifyPlan.reason !== "no-change"
			? getModifyBlockMessage(draftModifyPlan.reason)
			: null;
	const draftInvalidField = draftModifyPlan?.status === "blocked" ? draftModifyPlan.field : null;
	const modalError = modifyValidationError ?? draftModifyError ?? modifyError?.message;
	const actionError = cancelValidationError ?? cancelError?.message ?? (modifyTarget ? null : modalError);
	const isModifyBusy = modifyPhase !== "idle";
	const isModifyInteractionLocked = isModifyBusy || unconfirmedModifyOid !== null;
	const isModifyConfirmDisabled = isModifyInteractionLocked || !draftModifyPlan || draftModifyPlan.status === "blocked";
	const modifyOrder = modifyTarget
		? (openOrders.find((order) => order.oid === modifyTarget.size.order.oid) ?? null)
		: null;
	const modifyMarketLabel = modifyOrder ? (markets.getMarket(modifyOrder.coin)?.shortName ?? modifyOrder.coin) : "";

	if (!isConnected) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-fg-muted">
				{t`Connect your wallet to view open orders.`}
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-error">
				<span>{t`Failed to load open orders.`}</span>
				{error instanceof Error && <span className="mt-1 text-xs text-fg-muted">{error.message}</span>}
			</div>
		);
	}

	if (status === "active" && openOrders.length === 0) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
				<div className="size-12 rounded-full flex items-center justify-center bg-surface">
					<ListIcon className="size-6 text-fg-muted" />
				</div>
				<p className="text-sm text-fg-muted">{t`No open orders.`}</p>
			</div>
		);
	}

	return (
		<Skeleton name="orders-tab" loading={status === "subscribing" || status === "idle"}>
			<div className={cn(isPageScroll ? "min-h-0 flex flex-col" : "flex-1 min-h-0 flex flex-col", className)}>
				<div className="flex items-center gap-2 px-3 pt-2">
					<Select
						size="xxs"
						label={t`Order type`}
						value={typeFilter}
						onValueChange={handleTypeFilterChange}
						options={[
							{ value: "all", label: t`All Types` },
							{ value: "limit", label: t`Limit` },
							{ value: "trigger", label: t`Trigger` },
						]}
						triggerClassName="min-h-11 min-w-0 flex-1 !rounded-[7px] border-market-close-stroke-card bg-modal"
						className="min-w-0 flex-1 [&>label]:sr-only"
					/>
					<Select
						size="xxs"
						label={t`Direction`}
						value={directionFilter}
						onValueChange={handleDirectionFilterChange}
						options={[
							{ value: "all", label: t`All Directions` },
							{ value: "buy", label: t`Buy` },
							{ value: "sell", label: t`Sell` },
						]}
						triggerClassName="min-h-11 min-w-0 flex-1 !rounded-[7px] border-market-close-stroke-card bg-modal"
						className="min-w-0 flex-1 [&>label]:sr-only"
					/>
					<Button
						variant="ghost"
						intent="error"
						size="sm"
						className="min-h-11 shrink-0"
						onClick={handleRequestCancelAll}
						disabled={pendingScopes.size > 0 || openOrders.length === 0 || isModifyBusy}
					>
						{pendingScopes.has("all") ? t`Canceling...` : t`Cancel All`}
					</Button>
				</div>
				<div className="px-3 py-2 flex items-center gap-2 text-xs uppercase text-fg-muted">
					<ListNumbersIcon className="size-3" />
					{t`Open Orders`}
					<span className="font-semibold text-brand tabular-nums">{headerCount}</span>
					<div className="ml-auto">
						<MobileOrderBulkDetailsActions
							orderKeys={orderKeys}
							expandedOrderKeys={expandedOrderKeys}
							onExpandAll={() => expandAllOrders(orderKeys)}
							onCollapseAll={() => collapseAllOrders(orderKeys)}
						/>
					</div>
				</div>
				{actionError && (
					<div role="alert" className="px-3 pb-1 text-xs text-error">
						{actionError}
					</div>
				)}
				<div className={cn("px-3 pb-3 space-y-2", !isPageScroll && "flex-1 min-h-0 overflow-y-auto")}>
					{displayedOrders.length === 0 ? (
						<div className="py-8 text-center text-sm text-market-close-muted">{t`No orders match the filters.`}</div>
					) : null}
					{displayedOrders.map((order) => {
						const orderKey = `${order.coin}:${order.oid}`;
						return (
							<MobileOrderCard
								key={orderKey}
								order={order}
								szDecimals={markets.getSzDecimals(order.coin)}
								marketLabel={markets.getMarket(order.coin)?.shortName ?? order.coin}
								markPx={getMarketInfo(order.coin)?.markPx ?? ""}
								expanded={expandedOrderKeys.has(orderKey)}
								isCancelling={cancellingOids.has(order.oid)}
								actionsDisabled={isModifyBusy || pendingScopes.size > 0}
								modifyDisabled={isModifyInteractionLocked || cancellingOids.has(order.oid)}
								onCancel={handleCancelRow}
								onModify={handleRequestModify}
								onSelectMarket={handleSelectMarket}
								onExpandedChange={(expanded) => setOrderExpanded(orderKey, expanded)}
							/>
						);
					})}
				</div>
				<CancelAllOrdersModal
					open={cancelAllOpen}
					orderCount={cancelAllSnapshot?.orders.length ?? 0}
					isSubmitting={pendingScopes.has("all")}
					errorMessage={cancelAllOpen ? actionError : null}
					onOpenChange={handleCancelAllOpenChange}
					onConfirm={handleConfirmCancelAll}
				/>
				{modifyOrder ? (
					<MobileOrderModificationModal
						open
						marketLabel={modifyMarketLabel}
						directionLabel={getOrderSideLabel(modifyOrder.side, modifyOrder.reduceOnly)}
						directionTone={modifyOrder.side === "B" ? "positive" : "negative"}
						typeLabel={getFullOrderTypeLabel(modifyOrder)}
						sizeValue={modifySize}
						triggerPriceValue={modifyTriggerPrice}
						sizeInvalid={draftInvalidField === "size"}
						triggerPriceInvalid={draftInvalidField === "triggerPrice"}
						isSubmitting={modifyPhase === "submitting"}
						isAwaitingConfirmation={modifyPhase === "awaiting"}
						isInteractionLocked={isModifyInteractionLocked}
						isConfirmDisabled={isModifyConfirmDisabled}
						errorMessage={modalError}
						onSizeChange={handleModifySizeChange}
						onTriggerPriceChange={handleModifyTriggerPriceChange}
						onOpenChange={handleModifyOpenChange}
						onConfirm={handleConfirmModify}
					/>
				) : null}
			</div>
		</Skeleton>
	);
}

interface MobileOrderCardProps {
	order: OpenOrder;
	szDecimals: number;
	marketLabel: string;
	markPx: string;
	expanded: boolean;
	isCancelling: boolean;
	actionsDisabled: boolean;
	modifyDisabled: boolean;
	onCancel: (orders: OpenOrder[]) => void;
	onModify: (order: OpenOrder) => void;
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
		<div className="min-w-0">
			<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{label}</div>
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
	marketLabel,
	markPx,
	expanded,
	isCancelling,
	actionsDisabled,
	modifyDisabled,
	onCancel,
	onModify,
	onSelectMarket,
	onExpandedChange,
}: MobileOrderCardProps) {
	const { t } = useLingui();
	const detailsId = useId();
	const { getFullOrderTypeLabel, getOrderSideLabel, getTriggerConditionLabel } = useOrderDisplayLabels();
	const sideLabel = getOrderSideLabel(order.side, order.reduceOnly);
	const isBuy = order.side === "B";
	const side: Side = isBuy ? "buy" : "sell";
	const fullTypeLabel = getFullOrderTypeLabel(order);
	const sizeLabel = isClosePositionOrder(order)
		? t`Close Position`
		: formatToken(order.sz, { decimals: szDecimals, symbol: marketLabel });
	const originalSizeLabel = isClosePositionOrder(order)
		? t`Close Position`
		: formatToken(order.origSz, { decimals: szDecimals, symbol: marketLabel });
	const priceLabel = isMarketTriggerOrder(order) ? t`Market` : formatPrice(order.limitPx, { szDecimals });
	const triggerConditionLabel = order.triggerCondition
		? getTriggerConditionLabel(order.triggerCondition)
		: FALLBACK_VALUE_PLACEHOLDER;
	const canModify = getOpenOrderModifyCapabilities(order).size.supported;
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

	return (
		<article className="overflow-hidden rounded-[14px] border border-market-close-stroke-card bg-modal">
			<MobileDisclosureHeader
				expanded={expanded}
				label={expanded ? t`Collapse ${marketLabel} order details` : t`Expand ${marketLabel} order details`}
				controls={detailsId}
				onToggle={() => onExpandedChange(!expanded)}
				className="grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_16px] gap-2.5 px-3.5 py-[11px]"
			>
				<div className="min-w-0">
					<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Market`}</div>
					<button
						type="button"
						onClick={() => onSelectMarket(order.coin, side)}
						aria-label={t`Switch to ${marketLabel} market`}
						className="pointer-events-auto relative z-10 max-w-full truncate rounded-xs text-xs font-bold leading-[17px] text-market-close-fg after:absolute after:top-1/2 after:left-1/2 after:h-11 after:min-w-11 after:w-full after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
					>
						{marketLabel}
					</button>
				</div>
				<OrderMetric label={t`Type`} value={fullTypeLabel} />
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
						<div className="min-w-0">
							<OrderMetric label={t`Trigger Condition`} value={triggerConditionLabel} />
							{markDistanceLabel ? (
								<div
									className={cn(
										"truncate text-[10px] leading-[14px] tabular-nums",
										isNearMark ? "text-warning" : "text-market-close-subtle",
									)}
								>
									{t`Distance to mark ${markDistanceLabel}`}
								</div>
							) : null}
						</div>
						<OrderMetric label={t`Original Size`} value={originalSizeLabel} />
						<OrderMetric label={t`Reduce Only`} value={order.reduceOnly ? t`Yes` : t`No`} />
					</div>

					<div className="flex items-center justify-between border-t border-market-close-stroke-card pt-2.5">
						<div className="flex items-center gap-4">
							{canModify ? (
								<button
									type="button"
									className="inline-flex min-h-11 items-center rounded-xs text-[13px] font-semibold text-market-close-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:text-market-close-subtle"
									onClick={() => onModify(order)}
									disabled={modifyDisabled}
								>
									{t`Modify Order`}
								</button>
							) : null}
							<button
								type="button"
								className="inline-flex min-h-11 items-center gap-1.5 rounded-xs text-[13px] font-semibold text-market-close-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:text-market-close-danger-disabled"
								onClick={() => onCancel([order])}
								disabled={isCancelling || actionsDisabled}
							>
								{isCancelling ? <Spinner className="size-3" /> : <XIcon className="size-3.5" />}
								{t`Cancel`}
							</button>
						</div>
						<button
							type="button"
							aria-label={t`Collapse ${marketLabel} order details`}
							aria-controls={detailsId}
							onClick={() => onExpandedChange(false)}
							className="-mr-3.5 inline-flex size-11 items-center justify-center rounded-xs text-market-close-subtle focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-control"
						>
							<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
								<path
									d="M3.5 10 8 5.5l4.5 4.5"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</button>
					</div>
				</div>
			) : null}
		</article>
	);
}
