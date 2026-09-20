import { CaretDownIcon } from "@phosphor-icons/react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const TOKEN_SELECTOR_TRIGGER_CLASSNAME =
	"inline-flex h-9 shrink-0 select-none items-center gap-2 rounded-[9px] bg-transparent pr-2 font-market-close text-trading-panel-fg transition-[color,background-color] duration-150 ease-out hover:bg-trading-panel-hover active:bg-fill-press aria-expanded:bg-trading-panel-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stroke-focus motion-reduce:transition-none cursor-pointer leading-none";

const PAIR_NAME_SAMPLE = "BTC-USDC";
const KIND_BADGE_SAMPLE = "Perp";
const LEVERAGE_BADGE_SAMPLE = "20x";

interface Props extends Omit<ComponentPropsWithRef<"button">, "children"> {
	pairName: string | null;
	kindBadge?: string | null;
	leverageBadge?: string | null;
	isSpot: boolean;
	open: boolean;
	showAssetIcon: boolean;
	icon?: ReactNode;
}

export function TokenSelectorTriggerView({
	pairName,
	kindBadge,
	leverageBadge,
	isSpot,
	open,
	showAssetIcon,
	icon,
	className,
	ref,
	...rest
}: Props) {
	const badgeClassName =
		"inline-flex max-w-20 shrink-0 items-center truncate rounded-[4px] px-1.5 py-0.5 text-3xs leading-none font-semibold whitespace-nowrap";
	return (
		<button
			type="button"
			ref={ref}
			aria-expanded={open}
			{...rest}
			className={cn(TOKEN_SELECTOR_TRIGGER_CLASSNAME, showAssetIcon ? "pl-2" : "pl-1", className)}
		>
			{showAssetIcon ? icon : null}
			<span
				className={cn(
					"shrink-0 whitespace-nowrap text-base leading-none font-bold tracking-tight text-trading-panel-fg",
					pairName === null && "invisible",
				)}
				title={pairName ?? undefined}
			>
				{pairName ?? PAIR_NAME_SAMPLE}
			</span>
			<CaretDownIcon
				className={cn(
					"size-3 shrink-0 self-center text-trading-panel-muted transition-transform duration-150 ease-out motion-reduce:transition-none",
					open && "rotate-180",
				)}
			/>
			{kindBadge === null || kindBadge ? (
				<span
					className={cn(
						badgeClassName,
						kindBadge === null && "invisible",
						isSpot
							? "bg-trading-panel-success-soft text-trading-panel-success"
							: "bg-trading-panel-hover text-trading-panel-muted",
					)}
				>
					{kindBadge ?? KIND_BADGE_SAMPLE}
				</span>
			) : null}
			{!isSpot && (leverageBadge === null || leverageBadge) ? (
				<span
					className={cn(
						badgeClassName,
						"bg-trading-panel-hover text-trading-panel-muted tabular-nums",
						leverageBadge === null && "invisible",
					)}
				>
					{leverageBadge ?? LEVERAGE_BADGE_SAMPLE}
				</span>
			) : null}
		</button>
	);
}
