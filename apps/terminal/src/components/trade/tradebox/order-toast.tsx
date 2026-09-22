import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { CheckIcon, SpinnerGapIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { getOrderNotificationCopy } from "@/lib/trade/order-notification-copy";
import type { OrderQueueItem } from "@/stores/use-order-queue-store";

const scrollRegionClassName =
	"max-h-[min(18rem,35dvh,calc((100dvh_-_var(--offset-bottom,0px)_-_env(safe-area-inset-top)_-_4rem)/2))] overflow-y-auto overscroll-contain";

interface Props {
	order: OrderQueueItem;
	onDismiss: () => void;
}

export function OrderToast({ order, onDismiss }: Props) {
	const { t } = useLingui();
	const copy = getOrderNotificationCopy(order, (descriptor) => t(descriptor));
	const waiting = order.status === "pending" || order.status === "confirming";
	const successful = order.status === "success";
	const failed = order.status === "failed";
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
	return (
		<section
			aria-label={copy.label}
			data-order-feedback={order.id}
			className="w-full rounded-8 border border-stroke-weak bg-overlay p-3 shadow-overlay font-sans text-xs"
		>
			<div className="flex items-start gap-3">
				{waiting && <SpinnerGapIcon className="size-4 shrink-0 animate-spin text-signal" />}
				{successful && <CheckIcon className="size-4 shrink-0 text-success" />}
				{failed && <XIcon className="size-4 shrink-0 text-error" />}
				{!waiting && !successful && !failed && <WarningCircleIcon className="size-4 shrink-0 text-warning" />}
				<div className="min-w-0 flex-1 space-y-1">
					<div
						role={failed ? "alert" : "status"}
						aria-atomic="true"
						tabIndex={0}
						className={cn(
							scrollRegionClassName,
							"space-y-1 [overflow-wrap:anywhere]",
							successful && "text-success",
							failed && "text-error",
							!successful && !failed && "text-fg-muted",
						)}
					>
						<p data-order-summary dir="auto" className="font-medium">
							{copy.summary}
						</p>
						{copy.detail && (
							<p data-order-detail dir="auto">
								{copy.detail}
							</p>
						)}
						{copy.count && <p>{copy.count}</p>}
						{copy.error && <p dir="auto">{copy.error}</p>}
					</div>
				</div>
				<Button
					variant="ghost"
					intent="neutral"
					size="xs"
					onClick={onDismiss}
					aria-label={t`Dismiss`}
					className="min-h-6 min-w-6 shrink-0"
				>
					<XIcon className="size-4" />
				</Button>
			</div>
			{order.children && order.children.length > 0 && (
				<ul aria-label={t`Order results`} className={cn(scrollRegionClassName, "mt-2 divide-y divide-stroke-weak")}>
					{order.children.map((child, index) => (
						<li key={`${child.assetId}-${index}`} className="py-1.5 text-fg-muted [overflow-wrap:anywhere]">
							<div className="flex flex-wrap justify-between gap-2">
								<bdi>{child.market || t`Order ${index + 1}`}</bdi>
								<span>{childLabels[child.status]}</span>
							</div>
							{child.filledSize !== undefined && (
								<p>
									{t`Filled`}:{" "}
									<bdi>
										{child.filledSize}
										{child.size && ` / ${child.size}`}
									</bdi>
								</p>
							)}
							{child.filledSize === undefined && child.size && (
								<p>
									{t`Size`}: <bdi>{child.size}</bdi>
								</p>
							)}
							{child.error && (
								<p dir="auto" className="text-warning break-words">
									{child.error}
								</p>
							)}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
