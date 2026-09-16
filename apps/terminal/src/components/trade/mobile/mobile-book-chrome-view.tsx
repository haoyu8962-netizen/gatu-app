import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const book =
	"orderbook-panel-container flex-1 min-h-0 flex flex-col overflow-hidden font-market-close text-trading-panel-fg [--orderbook-hover-gap:4px]";
export const bookHeader =
	"grid h-[35px] shrink-0 grid-cols-2 items-center gap-1 border-b border-trading-panel-stroke-row pl-2 pr-3 text-xs tracking-normal orderbook-header-text uppercase";
export const bookMid = "shrink-0 flex h-[24px] items-center justify-start px-2 gap-1.5";
export const bookFooter =
	"shrink-0 h-[31px] border-t border-trading-panel-stroke-row flex items-center gap-1 text-trading-panel-muted pl-2 pr-1 text-xs max-[339px]:pl-1";

interface Props {
	panelProps?: ComponentPropsWithRef<"div">;
	ladderProps?: ComponentPropsWithRef<"fieldset">;
	labels: { price: string; size: string; mid: string };
	priceToken: string | null;
	sizeToken: string | null;
	mode: "both" | "asks" | "bids";
	isInteractive: boolean;
	isTransitioning: boolean;
	midDirection: "up" | "down" | "flat";
	midText: string;
	asks?: ReactNode;
	bids?: ReactNode;
	overlay?: ReactNode;
	children?: ReactNode;
	grouping: ReactNode;
	modes: ReactNode;
}
export function MobileBookChromeView({
	panelProps,
	ladderProps,
	labels,
	priceToken,
	sizeToken,
	mode,
	isInteractive,
	isTransitioning,
	midDirection,
	midText,
	asks,
	bids,
	overlay,
	children,
	grouping,
	modes,
}: Props) {
	return (
		<div {...panelProps} data-slot="compact-orderbook" className={book}>
			<div className={bookHeader}>
				<div className="min-w-0 truncate" title={priceToken ? `${labels.price} (${priceToken})` : labels.price}>
					{labels.price}{" "}
					<span
						data-slot="compact-orderbook-price-token"
						className={cn("orderbook-asset-heading normal-case", priceToken === null && "invisible")}
					>
						({priceToken ?? "USDC"})
					</span>
				</div>
				<div className="min-w-0 truncate text-right" title={sizeToken ? `${labels.size} (${sizeToken})` : labels.size}>
					{labels.size}{" "}
					<span
						data-slot="compact-orderbook-size-token"
						className={cn("orderbook-asset-heading normal-case", sizeToken === null && "invisible")}
					>
						({sizeToken ?? "BTC"})
					</span>
				</div>
			</div>

			<fieldset
				{...ladderProps}
				disabled={!isInteractive}
				aria-busy={isTransitioning}
				className={cn(
					"relative m-0 flex flex-1 min-h-0 flex-col gap-[4px] overflow-hidden border-0 p-0",
					!isInteractive && "pointer-events-none",
				)}
			>
				<div
					data-slot="compact-orderbook-asks"
					data-orderbook-side-container="ask"
					className={cn("relative flex-1 min-h-0 overflow-hidden", mode === "bids" && "hidden")}
				>
					{asks}
				</div>

				{mode === "both" && (
					<div data-slot="compact-orderbook-mid" data-direction={midDirection} className={bookMid}>
						<span className="sr-only">{labels.mid}: </span>
						<span
							data-slot="compact-orderbook-mid-price"
							className={cn(
								"shrink-0 tabular-nums text-base",
								midDirection === "up" && "text-trading-panel-success",
								midDirection === "down" && "text-trading-panel-error",
								midDirection === "flat" && "text-trading-panel-fg",
							)}
						>
							{midText}
						</span>
					</div>
				)}

				<div
					data-slot="compact-orderbook-bids"
					data-orderbook-side-container="bid"
					className={cn("relative flex-1 min-h-0 overflow-hidden", mode === "asks" && "hidden")}
				>
					{bids}
				</div>
				{overlay}
			</fieldset>
			{children}
			<div className={bookFooter}>
				{grouping}
				<span className="min-w-0 flex-1" aria-hidden="true" />
				{modes}
			</div>
		</div>
	);
}

interface ModeProps {
	mode: "both" | "asks" | "bids";
	label: string;
	options: readonly { mode: "both" | "asks" | "bids"; label: string; bars: Array<"ask" | "bid"> }[];
	onModeChange?: (mode: "both" | "asks" | "bids") => void;
}
export function MobileBookModeControlsView({ mode, label, options, onModeChange }: ModeProps) {
	return (
		<fieldset aria-label={label} className="m-0 flex shrink-0 items-center gap-1 border-0 p-0">
			{options.map((option) => {
				const selected = option.mode === mode;
				return (
					<button
						key={option.mode}
						type="button"
						aria-label={option.label}
						aria-pressed={selected}
						data-mode={option.mode}
						onClick={() => onModeChange?.(option.mode)}
						className={cn(
							"grid h-[22px] w-6 place-items-center rounded-[5px] text-trading-panel-muted transition-colors motion-reduce:transition-none",
							selected
								? "bg-trading-panel-card text-trading-panel-fg"
								: "hover:bg-trading-panel-hover hover:text-trading-panel-fg",
						)}
					>
						<OrderbookModeIcon bars={option.bars} />
					</button>
				);
			})}
		</fieldset>
	);
}

function OrderbookModeIcon({ bars }: { bars: Array<"ask" | "bid"> }) {
	return (
		<span className="grid size-3 grid-rows-2 overflow-hidden rounded-[3px]" aria-hidden="true">
			<span
				style={{
					backgroundColor: bars[0] === "ask" ? "var(--orderbook-depth-ask)" : "var(--orderbook-depth-bid)",
				}}
			/>
			<span
				style={{
					backgroundColor: bars[1] === "ask" ? "var(--orderbook-depth-ask)" : "var(--orderbook-depth-bid)",
				}}
			/>
		</span>
	);
}

export function MobileBookFrameView({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("flex flex-col min-h-0 flex-1 self-stretch", className)}>{children}</div>;
}
