import { CaretDownIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const marketBar =
	"w-full max-w-full min-w-0 shrink-0 overflow-hidden border-b border-trading-panel-stroke-row bg-surface font-market-close text-trading-panel-fg";
export const marketGrid =
	"grid min-h-[61px] min-w-0 grid-cols-2 items-center gap-x-4 px-4 py-2.5 max-[360px]:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] max-[360px]:gap-x-1 max-[360px]:px-2.5";
export const marketAsset = "flex shrink-0 [&>span]:size-11 [&_button]:size-11 [&_.relative.inline-flex]:size-7";
export const marketQuote =
	"grid min-w-0 grid-cols-[minmax(0,1fr)_36px] items-center gap-2 overflow-visible max-[360px]:gap-1";
export const marketPrice =
	"block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[18px] leading-[22px] font-bold text-trading-panel-fg tabular-nums max-[360px]:text-base max-[360px]:leading-5";
export const marketChange = "max-w-full whitespace-normal text-2xs leading-[15px] font-semibold tabular-nums";
export const marketExpand =
	"relative flex h-[30px] w-9 shrink-0 items-center justify-center rounded-[8px] border bg-transparent after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:bg-trading-panel-hover active:bg-fill-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus";

interface Props {
	className?: string;
	asset: ReactNode;
	selector: ReactNode;
	priceSequence?: number;
	priceDirection?: "up" | "down" | "flat" | null;
	priceText: string;
	changeClassName: string;
	changeTitle: string;
	changeText: string;
	expanded?: boolean;
	detailsId?: string;
	expandLabel: string;
	onToggle?: () => void;
	details?: ReactNode;
}
export function MobileMarketBarView({
	className,
	asset,
	selector,
	priceSequence,
	priceDirection,
	priceText,
	changeClassName,
	changeTitle,
	changeText,
	expanded,
	detailsId,
	expandLabel,
	onToggle,
	details,
}: Props) {
	return (
		<div data-slot="mobile-market-bar" className={cn(marketBar, className)}>
			<div className="min-w-0">
				<div className={marketGrid}>
					<div className="flex min-w-0 items-center gap-0">
						<div className={marketAsset}>{asset}</div>
						{selector}
					</div>

					<div className={marketQuote}>
						<div data-boneyard="market-price" className="min-w-0 text-start">
							<div className="flex min-w-0 flex-col items-start">
								<span
									key={priceSequence}
									data-direction={priceDirection ?? undefined}
									className={cn(marketPrice, priceDirection && "use-color-change")}
									title={priceText}
								>
									{priceText}
								</span>
								<div className={cn(marketChange, changeClassName)} title={changeTitle}>
									{changeText}
								</div>
							</div>
						</div>

						<button
							type="button"
							onClick={onToggle}
							className={cn(
								marketExpand,
								expanded
									? "border-trading-panel-control text-trading-panel-fg"
									: "border-trading-panel-stroke-input text-trading-panel-muted",
							)}
							aria-expanded={expanded}
							aria-controls={detailsId}
							aria-label={expandLabel}
						>
							<CaretDownIcon
								className={cn(
									"size-3.5 transition-transform duration-200 ease-out motion-reduce:transition-none",
									expanded && "rotate-180",
								)}
							/>
						</button>
					</div>
				</div>
				{details}
			</div>
		</div>
	);
}
