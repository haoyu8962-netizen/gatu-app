import { CaretDownIcon } from "@phosphor-icons/react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const marketSelector =
	"inline-flex min-h-11 min-w-0 shrink-0 items-center rounded-[9px] bg-transparent py-1 pr-1 font-market-close hover:bg-trading-panel-hover active:bg-fill-press cursor-pointer leading-none";
export const marketName =
	"whitespace-nowrap text-base leading-5 font-bold tracking-tight text-trading-panel-fg max-[360px]:text-2sm max-[360px]:leading-4";
export const marketBadge =
	"inline-flex max-w-20 shrink-0 items-center truncate rounded-[4px] px-1.5 py-0.5 text-3xs leading-none font-semibold whitespace-nowrap";

interface Props {
	pairName: string | null;
	kindBadge?: string | null;
	leverageBadge?: string | null;
	isSpot: boolean;
	showAssetIcon?: boolean;
	icon?: ReactNode;
}
export function MobileTokenSelectorContentView({ pairName, kindBadge, leverageBadge, isSpot, icon }: Props) {
	const name = pairName ?? "BTC-USDC";
	const separator = name.indexOf("-");
	return (
		<>
			{icon}
			<span className="flex min-w-0 shrink-0 flex-col items-start gap-1">
				<span className="flex min-w-0 items-center gap-1.5 max-[360px]:gap-1">
					<span className={cn(marketName, pairName === null && "invisible")} title={pairName ?? undefined}>
						<span>{separator < 0 ? name : name.slice(0, separator)}</span>
						{separator >= 0 ? <span>{name.slice(separator)}</span> : null}
					</span>
					<CaretDownIcon className="size-3 shrink-0 text-trading-panel-subtle" />
				</span>
				{(kindBadge !== undefined || leverageBadge !== undefined) && (
					<span className="flex min-w-0 items-center gap-1">
						{kindBadge !== undefined && (
							<span
								className={cn(
									marketBadge,
									kindBadge === null && "invisible",
									isSpot
										? "bg-trading-panel-success-soft text-trading-panel-success"
										: "bg-trading-panel-hover text-trading-panel-muted",
								)}
							>
								{kindBadge ?? "Perp"}
							</span>
						)}
						{!isSpot && leverageBadge !== undefined && (
							<span
								className={cn(
									marketBadge,
									"bg-trading-panel-hover text-trading-panel-muted tabular-nums",
									leverageBadge === null && "invisible",
								)}
							>
								{leverageBadge ?? "20x"}
							</span>
						)}
					</span>
				)}
			</span>
		</>
	);
}
export function MobileTokenSelectorView({
	pairName,
	kindBadge,
	leverageBadge,
	isSpot,
	icon,
	showAssetIcon = false,
	className,
	...props
}: Props & Omit<ComponentPropsWithRef<"button">, "children">) {
	return (
		<button
			type="button"
			data-slot="mobile-market-selector"
			{...props}
			className={cn(marketSelector, showAssetIcon ? "pl-2.5" : "pl-1", className)}
		>
			<MobileTokenSelectorContentView
				pairName={pairName}
				kindBadge={kindBadge}
				leverageBadge={leverageBadge}
				isSpot={isSpot}
				icon={icon}
			/>
		</button>
	);
}
