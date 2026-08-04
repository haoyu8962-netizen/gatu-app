import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ListIcon, ListNumbersIcon, XIcon } from "@phosphor-icons/react";
import { Skeleton } from "boneyard-js/react";
import { type ReactNode, useId, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { FALLBACK_VALUE_PLACEHOLDER, HL_ALL_DEXS } from "@/config/app";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatDateTime, formatPrice, formatToken } from "@/lib/format";
import { useExchange, useMarkets, useSubscription } from "@/lib/hyperliquid";
import type { MarketKind } from "@/lib/hyperliquid/markets";
import { isClosePositionOrder, isMarketTriggerOrder, type OpenOrder } from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { CancelAllOrdersModal } from "../positions/cancel-all-orders-modal";
import { MobileDisclosureHeader } from "./mobile-disclosure-header";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

interface Props {
	className?: string;
	scrollMode?: MobileDataScrollMode;
}

type CancelScope = "row" | "all";

interface CancelCallbacks {
	onSuccess?: () => void;
	onSettled?: () => void;
}

export function MobileOrdersTab({ className, scrollMode = "contained" }: Props) {
	const { t } = useLingui();
	const { address, isConnected } = useWalletSession();
	const navigateToMarket = useMarketNavigation();
	const { setActiveTab } = useMobileTerminalTab();
	const { setSide } = useOrderEntryActions();
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
	} = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);

	const { mutate: cancelOrders, error: cancelError, reset: resetCancelError } = useExchange("cancel");

	const [cancellingOids, setCancellingOids] = useState<Set<number>>(() => new Set());
	const [pendingScopes, setPendingScopes] = useState<Set<CancelScope>>(() => new Set());
	const [cancelAllOpen, setCancelAllOpen] = useState(false);
	const [cancelValidationError, setCancelValidationError] = useState<string | null>(null);
	const cancelAllSubmittingRef = useRef(false);

	const openOrders = openOrdersEvent?.orders ?? [];
	const isPageScroll = scrollMode === "page";

	function handleCancel(ordersToCancel: OpenOrder[], nextScope: CancelScope, callbacks?: CancelCallbacks): boolean {
		if (ordersToCancel.length === 0) return false;
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

	const headerCount = isConnected ? openOrders.length : FALLBACK_VALUE_PLACEHOLDER;
	const actionError = cancelValidationError ?? cancelError?.message;

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
				<div className="px-3 py-2 flex items-center gap-2 text-xs uppercase text-fg-muted">
					<ListNumbersIcon className="size-3" />
					{t`Open Orders`}
					<span className="font-semibold text-brand tabular-nums">{headerCount}</span>
					<Button
						variant="ghost"
						intent="error"
						size="sm"
						className="ml-auto touch-target"
						onClick={handleRequestCancelAll}
						disabled={pendingScopes.has("all") || openOrders.length === 0}
					>
						{pendingScopes.has("all") ? t`Canceling...` : t`Cancel All`}
					</Button>
				</div>
				{actionError && <div className="px-3 pb-1 text-xs text-error">{actionError}</div>}
				<div className={cn("px-3 pb-3 space-y-2", !isPageScroll && "flex-1 min-h-0 overflow-y-auto")}>
					{openOrders.map((order) => (
						<MobileOrderCard
							key={order.oid}
							order={order}
							szDecimals={markets.getSzDecimals(order.coin)}
							kind={markets.getMarket(order.coin)?.kind}
							marketLabel={markets.getMarket(order.coin)?.shortName ?? order.coin}
							isCancelling={cancellingOids.has(order.oid)}
							onCancel={handleCancelRow}
							onSelectMarket={handleSelectMarket}
						/>
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
		</Skeleton>
	);
}

interface MobileOrderCardProps {
	order: OpenOrder;
	szDecimals: number;
	kind: MarketKind | undefined;
	marketLabel: string;
	isCancelling: boolean;
	onCancel: (orders: OpenOrder[]) => void;
	onSelectMarket: (marketName: string, side: Side) => void;
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
	kind,
	marketLabel,
	isCancelling,
	onCancel,
	onSelectMarket,
}: MobileOrderCardProps) {
	const { t } = useLingui();
	const [expanded, setExpanded] = useState(false);
	const detailsId = useId();
	const { getFullOrderTypeLabel, getOrderSideLabel, getTriggerConditionLabel } = useOrderDisplayLabels();
	const sideLabel = getOrderSideLabel(order.side, kind);
	const isLong = order.side === "B";
	const side: Side = isLong ? "buy" : "sell";
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

	return (
		<article className="overflow-hidden rounded-[14px] border border-market-close-stroke-card bg-modal">
			<MobileDisclosureHeader
				expanded={expanded}
				label={expanded ? t`Collapse ${marketLabel} order details` : t`Expand ${marketLabel} order details`}
				controls={detailsId}
				onToggle={() => setExpanded((value) => !value)}
				className="grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_16px] gap-2.5 px-3.5 py-[11px]"
			>
				<div className="min-w-0">
					<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Market`}</div>
					<button
						type="button"
						onClick={() => onSelectMarket(order.coin, side)}
						aria-label={t`Switch to ${marketLabel} market`}
						className="pointer-events-auto relative z-10 max-w-full truncate rounded-xs text-xs font-bold leading-[17px] text-market-close-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
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
							valueClassName={isLong ? "text-market-close-success" : "text-market-close-danger"}
						/>
						<OrderMetric label={t`Price`} value={priceLabel} />
						<OrderMetric label={t`Trigger Condition`} value={triggerConditionLabel} />
						<OrderMetric label={t`Original Size`} value={originalSizeLabel} />
						<OrderMetric label={t`Reduce Only`} value={order.reduceOnly ? t`Yes` : t`No`} />
					</div>

					<div className="flex items-center justify-between border-t border-market-close-stroke-card pt-2.5">
						<button
							type="button"
							className="inline-flex min-h-11 items-center gap-1.5 rounded-xs text-[13px] font-semibold text-market-close-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:text-market-close-danger-disabled"
							onClick={() => onCancel([order])}
							disabled={isCancelling}
						>
							{isCancelling ? <Spinner className="size-3" /> : <XIcon className="size-3.5" />}
							{t`Cancel`}
						</button>
						<button
							type="button"
							aria-label={t`Collapse ${marketLabel} order details`}
							aria-controls={detailsId}
							onClick={() => setExpanded(false)}
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
