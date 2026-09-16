import type { SideLabels } from "@/config/ui-text";
import { cn } from "@/lib/cn";

export const sideBox = "rounded-[10px] border-trading-panel-stroke-card bg-surface";

interface Props {
	side: "buy" | "sell";
	labels: SideLabels;
}

export function SideToggleView({ side, labels }: Props) {
	return (
		<div>
			<div
				className={cn(
					"relative overflow-hidden inline-flex items-center bg-fill-weak border border-stroke-weak rounded-8 w-full mb-0",
					sideBox,
				)}
			>
				<span
					className={cn(
						"absolute inset-y-0 rounded-8 bg-overlay border border-stroke-strong shadow-raised transition-[left,width] duration-200 ease-in-out motion-reduce:transition-none",
						"shadow-none",
						side === "buy"
							? "rounded-[9px] border-trading-panel-success bg-trading-panel-success-fill"
							: "rounded-[9px] border-trading-panel-error bg-trading-panel-error-fill",
					)}
					style={{ left: side === "buy" ? "0%" : "50%", width: "50%" }}
				/>
				{(["buy", "sell"] as const).map((value) => (
					<button
						key={value}
						type="button"
						data-active={side === value ? "" : undefined}
						aria-label={value === "buy" ? labels.buyAria : labels.sellAria}
						className={cn(
							"relative inline-flex items-center justify-center rounded-8 font-normal text-fg-muted border border-transparent cursor-pointer select-none whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none data-active:text-fg hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus data-disabled:text-fg-disabled data-disabled:cursor-not-allowed py-1.5 px-3 text-xs gap-1 flex-1",
							value === "buy" ? "data-[active]:text-success" : "data-[active]:text-error",
							"relative rounded-[9px] font-bold text-trading-panel-muted after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-['']",
							value === "buy"
								? "data-[active]:text-trading-panel-on-success"
								: "data-[active]:text-trading-panel-on-error",
							"py-1.5 text-2sm",
						)}
					>
						{labels[value]}
					</button>
				))}
			</div>
		</div>
	);
}
