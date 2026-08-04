import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { CheckIcon, LightningIcon, SpinnerGapIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { type CSSProperties, useEffect } from "react";
import { createPortal } from "react-dom";
import { MOBILE_BOTTOM_NAV_HEIGHT_PX } from "@/config/layout";
import { ORDER_TOAST_SUCCESS_DURATION_MS } from "@/config/time";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { cn } from "@/lib/cn";
import { type OrderQueueItem, useOrderQueue, useOrderQueueActions } from "@/stores/use-order-queue-store";

const ORDER_TOAST_MOBILE_GAP_PX = 12;
const ORDER_TOAST_MOBILE_BOTTOM = `calc(env(safe-area-inset-bottom) + ${
	MOBILE_BOTTOM_NAV_HEIGHT_PX + ORDER_TOAST_MOBILE_GAP_PX
}px)`;
const ORDER_TOAST_WIDTH = "left-4 right-4 w-auto min-[1001px]:left-auto min-[1001px]:right-6 min-[1001px]:w-80";
const ORDER_TOAST_LIST_MAX_HEIGHT = "max-h-[min(18rem,40dvh)]";

function useAutoRemove(order: OrderQueueItem, onRemove: () => void) {
	useEffect(() => {
		if (order.status !== "success" || !order.completedAt) return;

		const elapsed = Date.now() - order.completedAt;
		const remaining = ORDER_TOAST_SUCCESS_DURATION_MS - elapsed;

		if (remaining <= 0) {
			onRemove();
			return;
		}

		const timer = setTimeout(onRemove, remaining);
		return () => clearTimeout(timer);
	}, [order.status, order.completedAt, onRemove]);
}

function OrderItem({ order, onRemove }: { order: OrderQueueItem; onRemove: () => void }) {
	const { t } = useLingui();
	const { getOrderOutcomeLabel, getQueueOrderTypeLabel, getQueueSideLabel } = useOrderDisplayLabels();
	useAutoRemove(order, onRemove);

	const sideColor = order.side === "buy" ? "text-success" : "text-error";
	const sideBg = order.side === "buy" ? "bg-success-soft" : "bg-error-soft";
	const orderTypeLabel = getQueueOrderTypeLabel(order.orderType);
	const hasTpSl = order.tpPrice || order.slPrice;

	return (
		<div
			className={cn(
				"flex gap-3 py-2.5 px-3 transition-[opacity,transform] duration-300",
				order.status === "pending" && "animate-pulse",
			)}
		>
			<div
				className={cn(
					"flex items-center justify-center size-7 rounded-8 shrink-0",
					order.status === "pending" && "bg-brand-soft border border-stroke-brand-strong/30",
					order.status === "confirming" && "bg-warning-soft border border-stroke-warning-strong/30",
					order.status === "unconfirmed" && "bg-warning-soft border border-stroke-warning-strong/30",
					order.status === "partial" && "bg-warning-soft border border-stroke-warning-strong/30",
					order.status === "success" && "bg-success-soft border border-stroke-success-strong/30",
					order.status === "canceled" && "bg-warning-soft border border-stroke-warning-strong/30",
					order.status === "failed" && "bg-error-soft border border-stroke-error-strong/30",
				)}
			>
				{order.status === "pending" && <SpinnerGapIcon className="size-4 animate-spin text-brand" />}
				{order.status === "confirming" && <SpinnerGapIcon className="size-4 animate-spin text-warning" />}
				{order.status === "unconfirmed" && <WarningCircleIcon className="size-4 text-warning" />}
				{order.status === "partial" && <WarningCircleIcon className="size-4 text-warning" />}
				{order.status === "success" && <CheckIcon className="size-4 text-success" />}
				{order.status === "canceled" && <WarningCircleIcon className="size-4 text-warning" />}
				{order.status === "failed" && <XIcon className="size-4 text-error" />}
			</div>

			<div className="flex-1 min-w-0 space-y-0.5">
				<div className="flex items-center gap-2">
					{orderTypeLabel && (
						<span className="px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wide bg-surface text-fg-muted">
							{orderTypeLabel}
						</span>
					)}
					<span className={cn("px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wide", sideBg, sideColor)}>
						{getQueueSideLabel(order.side)}
					</span>
					<span className="text-xs font-medium text-fg">{order.market}</span>
					{order.status === "success" && order.outcome && (
						<span className={cn("text-xs font-medium", order.outcome === "filled" ? "text-success" : "text-fg-muted")}>
							{getOrderOutcomeLabel(order.outcome)}
						</span>
					)}
				</div>
				<div className="text-xs text-fg-muted flex items-center gap-2 flex-wrap">
					<span>
						{t`Size`}: <span className="text-fg font-medium">{order.size}</span>
					</span>
					{order.price && (
						<span>
							@ <span className="text-fg font-medium">{order.price}</span>
						</span>
					)}
				</div>
				{hasTpSl && (
					<div className="text-xs text-fg-muted flex items-center gap-2">
						{order.tpPrice && (
							<span>
								TP: <span className="text-success font-medium">{order.tpPrice}</span>
							</span>
						)}
						{order.slPrice && (
							<span>
								SL: <span className="text-error font-medium">{order.slPrice}</span>
							</span>
						)}
					</div>
				)}
				{order.status === "confirming" && (
					<div className="text-xs text-warning">{t`Confirming order status. Do not retry.`}</div>
				)}
				{order.status === "partial" && order.acceptedCount !== undefined && order.totalCount !== undefined && (
					<div className="text-xs text-warning">
						{t`${order.acceptedCount} of ${order.totalCount} orders were accepted. Review open orders before retrying.`}
					</div>
				)}
				{order.error && (
					<div
						className={cn(
							"text-xs",
							order.status === "partial" || order.status === "unconfirmed" || order.status === "canceled"
								? "text-warning"
								: "text-error",
						)}
					>
						{order.error}
					</div>
				)}
			</div>

			{(order.status === "unconfirmed" ||
				order.status === "partial" ||
				order.status === "canceled" ||
				order.status === "failed") && (
				<Button
					variant="ghost"
					intent="neutral"
					onClick={onRemove}
					className="p-1.5 rounded-8 text-fg-muted hover:text-fg hover:bg-fill-hover transition-colors shrink-0 self-start"
					aria-label={t`Dismiss`}
				>
					<XIcon className="size-4" />
				</Button>
			)}
		</div>
	);
}

function CountdownBar({ order }: { order: OrderQueueItem }) {
	if (order.status !== "success") return null;

	return (
		<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-success-soft overflow-hidden">
			<div
				className="h-full bg-success/60 animate-countdown"
				style={{ animationDuration: `${ORDER_TOAST_SUCCESS_DURATION_MS}ms` }}
			/>
		</div>
	);
}

export function OrderToast() {
	const { t } = useLingui();
	const orders = useOrderQueue();
	const { removeOrder } = useOrderQueueActions();
	if (orders.length === 0 || typeof document === "undefined") return null;

	const pendingCount = orders.filter((o) => o.status === "pending").length;
	const confirmingCount = orders.filter((o) => o.status === "confirming").length;
	const unconfirmedCount = orders.filter((o) => o.status === "unconfirmed").length;
	const partialCount = orders.filter((o) => o.status === "partial").length;
	const successCount = orders.filter((o) => o.status === "success").length;
	const canceledCount = orders.filter((o) => o.status === "canceled").length;
	const failedCount = orders.filter((o) => o.status === "failed").length;

	return createPortal(
		<output
			aria-live="polite"
			style={{ "--order-toast-mobile-bottom": ORDER_TOAST_MOBILE_BOTTOM } as CSSProperties}
			className={cn(
				ORDER_TOAST_WIDTH,
				"fixed z-[var(--z-toast)] bottom-[var(--order-toast-mobile-bottom)] min-[1001px]:bottom-[calc(env(safe-area-inset-bottom)+3.5rem)]",
				"bg-surface/95 backdrop-blur-sm",
				"border border-stroke-weak/60 rounded-8 overflow-hidden",
				"shadow-overlay shadow-black/20 dark:shadow-black/50",
				"font-sans",

				pendingCount > 0 && "ring-1 ring-stroke-brand-strong/30",
				confirmingCount > 0 && pendingCount === 0 && "ring-1 ring-stroke-warning-strong/30",
				unconfirmedCount > 0 && pendingCount === 0 && confirmingCount === 0 && "ring-1 ring-stroke-warning-strong/30",
				partialCount > 0 &&
					pendingCount === 0 &&
					confirmingCount === 0 &&
					unconfirmedCount === 0 &&
					"ring-1 ring-stroke-warning-strong/30",
				canceledCount > 0 &&
					pendingCount === 0 &&
					confirmingCount === 0 &&
					unconfirmedCount === 0 &&
					partialCount === 0 &&
					"ring-1 ring-stroke-warning-strong/30",
				failedCount > 0 &&
					pendingCount === 0 &&
					confirmingCount === 0 &&
					unconfirmedCount === 0 &&
					partialCount === 0 &&
					canceledCount === 0 &&
					"ring-1 ring-stroke-error-strong/30",
				successCount > 0 &&
					pendingCount === 0 &&
					confirmingCount === 0 &&
					unconfirmedCount === 0 &&
					partialCount === 0 &&
					canceledCount === 0 &&
					failedCount === 0 &&
					"ring-1 ring-stroke-success-strong/30",
			)}
		>
			<div className="px-3 py-2 border-b border-stroke-weak/40 bg-surface flex items-center justify-between">
				<div className="flex items-center gap-2">
					<LightningIcon className="size-4 text-brand" />
					<span className="text-xs font-semibold uppercase tracking-wider text-fg">{t`Order Queue`}</span>
				</div>
				<div className="flex items-center gap-1.5">
					{pendingCount > 0 && (
						<span className="px-1.5 py-0.5 rounded text-xs font-medium bg-brand-soft text-brand border border-stroke-brand-strong/30">
							{pendingCount} {t`pending`}
						</span>
					)}
					{confirmingCount > 0 && (
						<span className="px-1.5 py-0.5 rounded text-xs font-medium bg-warning-soft text-warning border border-stroke-warning-strong/30">
							{confirmingCount} {t`confirming`}
						</span>
					)}
					{unconfirmedCount > 0 && (
						<span className="px-1.5 py-0.5 rounded text-xs font-medium bg-warning-soft text-warning border border-stroke-warning-strong/30">
							{unconfirmedCount} {t`unconfirmed`}
						</span>
					)}
					{partialCount > 0 && (
						<span className="px-1.5 py-0.5 rounded text-xs font-medium bg-warning-soft text-warning border border-stroke-warning-strong/30">
							{partialCount} {t`partial`}
						</span>
					)}
					{canceledCount > 0 && (
						<span className="px-1.5 py-0.5 rounded text-xs font-medium bg-warning-soft text-warning border border-stroke-warning-strong/30">
							{canceledCount} {t`Canceled`}
						</span>
					)}
					{failedCount > 0 && (
						<span className="px-1.5 py-0.5 rounded text-xs font-medium bg-error-soft text-error border border-stroke-error-strong/30">
							{failedCount} {t`failed`}
						</span>
					)}
				</div>
			</div>

			<div className={cn("divide-y divide-stroke-weak/30 overflow-y-auto", ORDER_TOAST_LIST_MAX_HEIGHT)}>
				{orders.map((order) => (
					<div key={order.id} className="relative">
						<OrderItem order={order} onRemove={() => removeOrder(order.id)} />
						<CountdownBar order={order} />
					</div>
				))}
			</div>
		</output>,
		document.body,
	);
}
