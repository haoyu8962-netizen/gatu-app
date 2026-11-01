import type { CSSProperties, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";

interface Props {
	labels: { price: string; size: string; total: string; spread: string };
	grouping: ReactNode;
	unit: ReactNode;
	assetLabel: string | null;
	spreadText: string;
	asks?: ReactNode;
	bids?: ReactNode;
	sideStyle?: CSSProperties;
	ladderRef?: Ref<HTMLDivElement>;
}

export const ORDERBOOK_PANEL_CLASS =
	"orderbook-panel-container h-full min-h-0 flex flex-col overflow-hidden bg-surface";
export const ORDERBOOK_TAB_CONTENT_CLASS = "flex-1 min-h-0 mt-0 pt-0 flex flex-col";

export function OrderbookPanelView({
	labels,
	grouping,
	unit,
	assetLabel,
	spreadText,
	asks,
	bids,
	sideStyle,
	ladderRef,
}: Props) {
	return (
		<>
			<div
				data-slot="orderbook-controls"
				className="flex h-6 shrink-0 items-center justify-between gap-2 px-1 text-xs orderbook-header-text"
			>
				{grouping}
				{unit}
			</div>
			<div className="orderbook-grid grid gap-1 px-2 pb-1 items-center text-xs orderbook-header-text border-b border-stroke-weak shrink-0">
				<div className="min-w-0 truncate">{labels.price}</div>
				<div className="min-w-0 truncate">
					<span className="flex min-w-0 items-center justify-end gap-0.5">
						{labels.size}
						<span className={cn("orderbook-asset-heading text-fg truncate", assetLabel === null && "invisible")}>
							({assetLabel ?? "BTC"})
						</span>
					</span>
				</div>
				<div className="min-w-0 truncate">
					<span className="flex min-w-0 items-center justify-end gap-0.5">
						{labels.total}
						<span className={cn("orderbook-asset-heading text-fg truncate", assetLabel === null && "invisible")}>
							({assetLabel ?? "BTC"})
						</span>
					</span>
				</div>
			</div>

			<div ref={ladderRef} className="flex-1 min-h-0 flex flex-col overflow-hidden">
				<div
					data-slot="orderbook-asks"
					data-orderbook-side-container="ask"
					style={sideStyle}
					className="flex-1 min-h-0 overflow-hidden flex flex-col justify-end gap-[2px]"
				>
					{asks}
				</div>

				<div
					data-slot="orderbook-spread"
					className="orderbook-spread-bg shrink-0 px-2 py-1.5 border-y border-stroke-weak flex items-center justify-between text-xs text-fg"
				>
					<span>{labels.spread}</span>
					<span className="tabular-nums font-medium text-fg-muted">{spreadText}</span>
				</div>

				<div
					data-slot="orderbook-bids"
					data-orderbook-side-container="bid"
					style={sideStyle}
					className="flex-1 min-h-0 overflow-hidden flex flex-col gap-[2px]"
				>
					{bids}
				</div>
			</div>
		</>
	);
}
