import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { getTradingCtaClass, type TradingCtaVariant } from "@/lib/ui/trading-cta";

interface Props extends ComponentPropsWithRef<"button"> {
	label: string;
	variant: TradingCtaVariant | "restricted";
	iconLeft?: ReactNode;
}

export function TradeCtaView({ label, variant, iconLeft, className, disabled, ...props }: Props) {
	return (
		<button
			type="button"
			{...props}
			disabled={disabled}
			data-disabled={disabled ? "" : undefined}
			className={cn(
				"inline-flex items-center justify-center gap-2 font-semibold select-none cursor-pointer rounded-8 transition-[color,background-color,border-color,opacity,scale] duration-150 ease-out motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus data-disabled:cursor-not-allowed shadow-raised active:not-data-disabled:scale-[0.97] py-1 px-2 text-xs gap-1",
				variant === "cyan"
					? "bg-action text-on-action hover:bg-action-hover active:bg-action-active data-disabled:text-fg-disabled data-disabled:bg-fill-disabled"
					: "text-fg-inverse hover:opacity-90 active:opacity-80 data-disabled:text-fg-disabled data-disabled:bg-fill-disabled",
				variant !== "cyan" && (variant === "sell" ? "bg-error" : "bg-fill"),
				"w-full rounded-[12px] px-3 py-2.5 text-sm font-bold whitespace-nowrap shadow-none",
				variant === "restricted"
					? "data-disabled:bg-trading-panel-neutral-disabled-fill data-disabled:text-trading-panel-on-disabled"
					: cn("focus-visible:outline-offset-1", getTradingCtaClass(variant)),
				className,
				iconLeft && "pl-1.5",
			)}
		>
			{iconLeft}
			{label}
		</button>
	);
}
