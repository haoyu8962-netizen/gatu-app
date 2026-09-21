import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { CheckIcon, SpinnerGapIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { cn } from "@/lib/cn";
import type { OrderQueueItem } from "@/stores/use-order-queue-store";
import { OrderQueueErrorMessage } from "./order-queue-error-message";

interface Props {
	order: OrderQueueItem;
	onDismiss: () => void;
}

export function OrderToast({ order, onDismiss }: Props) {
	const { t } = useLingui();
	const { getOrderOutcomeLabel, getQueueOrderTypeLabel, getQueueSideLabel } = useOrderDisplayLabels();
	const waiting = order.status === "pending" || order.status === "confirming";
	const successful = order.status === "success";
	const failed = order.status === "failed";
	const statusLabels = {
		pending: t`Submitting`,
		confirming: t`Confirming order status. Do not retry.`,
		unconfirmed: t`Status unconfirmed. Review orders and positions before retrying.`,
		partial: t`Partially completed`,
		success: t`Confirmed`,
		canceled: t`Canceled`,
		failed: t`Failed`,
	};
	const childLabels = {
		pending: t`Pending`,
		filled: t`Fully filled`,
		"filled-unverified": t`Filled (quantity unverified)`,
		partial: t`Partially filled`,
		accepted: t`Accepted`,
		rejected: t`Rejected`,
		unknown: t`Status unconfirmed`,
		canceled: t`Canceled`,
	};
	function getTitle() {
		if (order.title) return t(order.title);
		if (order.operation === "close-all") return t`Close All Positions`;
		if (order.operation === "market-close") return t`Market Close`;
		if (order.operation === "spot-swap") return t`Swap`;
		return getQueueOrderTypeLabel(order.orderType) || t`Order`;
	}
	function getStatus() {
		if (order.message) return t(order.message);
		if (order.positionsClosed && successful) return t`All positions closed`;
		if (successful && order.outcome) return getOrderOutcomeLabel(order.outcome);
		return statusLabels[order.status];
	}
	return (
		<section
			aria-label={getTitle()}
			data-order-feedback={order.id}
			className="w-full rounded-8 border border-stroke-weak bg-overlay p-3 shadow-overlay font-sans text-xs"
		>
			<div className="flex items-start gap-3">
				{waiting && <SpinnerGapIcon className="size-4 shrink-0 animate-spin text-signal" />}
				{successful && <CheckIcon className="size-4 shrink-0 text-success" />}
				{failed && <XIcon className="size-4 shrink-0 text-error" />}
				{!waiting && !successful && !failed && <WarningCircleIcon className="size-4 shrink-0 text-warning" />}
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex flex-wrap gap-2 font-semibold text-fg">
						<span>{getTitle()}</span>
						{order.market && <span>{order.market}</span>}
						{order.side && (
							<span className={cn(order.side === "buy" ? "text-success" : "text-error")}>
								{getQueueSideLabel(order.side)}
							</span>
						)}
					</div>
					<div
						role={failed ? "alert" : "status"}
						aria-atomic="true"
						className={cn(
							"space-y-1",
							successful && "text-success",
							failed && "text-error",
							!successful && !failed && "text-fg-muted",
						)}
					>
						<p>{getStatus()}</p>
						{order.size && (
							<p>
								{t`Size`}: {order.size}
								{order.price && ` @ ${order.price}`}
							</p>
						)}
						{order.tpPrice && <p>TP: {order.tpPrice}</p>}
						{order.slPrice && <p>SL: {order.slPrice}</p>}
						{order.status === "partial" && order.acceptedCount !== undefined && order.totalCount !== undefined && (
							<p>
								{order.countMode === "filled"
									? t`${order.acceptedCount} of ${order.totalCount} close orders fully filled. Review positions before retrying.`
									: t`${order.acceptedCount} of ${order.totalCount} orders were accepted. Review open orders before retrying.`}
							</p>
						)}
						{order.error && !successful && <OrderQueueErrorMessage error={order.error} />}
					</div>
				</div>
				<Button
					variant="ghost"
					intent="neutral"
					size="xs"
					onClick={onDismiss}
					aria-label={t`Dismiss`}
					className="shrink-0"
				>
					<XIcon className="size-4" />
				</Button>
			</div>
			{order.children && order.children.length > 0 && (
				<ul
					aria-label={t`Order results`}
					className="mt-2 max-h-[min(18rem,35dvh)] overflow-y-auto divide-y divide-stroke-weak overscroll-contain"
				>
					{order.children.map((child, index) => (
						<li key={`${child.assetId}-${index}`} className="py-1.5 text-fg-muted">
							<div className="flex flex-wrap justify-between gap-2">
								<span>{child.market || t`Order ${index + 1}`}</span>
								<span>{childLabels[child.status]}</span>
							</div>
							{child.filledSize !== undefined && (
								<p>
									{t`Filled`}: {child.filledSize}
									{child.size && ` / ${child.size}`}
								</p>
							)}
							{child.filledSize === undefined && child.size && (
								<p>
									{t`Size`}: {child.size}
								</p>
							)}
							{child.error && <p className="text-warning break-words">{child.error}</p>}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
