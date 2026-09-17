import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { getTradingCtaClass, type TradingCtaVariant } from "@/lib/ui/trading-cta";
import { ctaButton, ctaEmbeddedHeight } from "../mobile/mobile-trade-cta-frame-view";

interface Props extends ComponentPropsWithRef<"button"> {
	label: string;
	variant: TradingCtaVariant | "restricted";
	iconLeft?: ReactNode;
	mobile?: boolean;
	embedded?: boolean;
}

export function TradeCtaView({ label, variant, iconLeft, className, disabled, mobile, embedded, ...props }: Props) {
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
				mobile
					? cn(
							embedded ? "py-2 px-4 text-sm gap-2" : "py-3 px-6 text-base gap-2",
							ctaButton,
							embedded && ctaEmbeddedHeight,
						)
					: "w-full rounded-[12px] px-3 py-2.5 text-sm font-bold whitespace-nowrap shadow-none",
				variant === "restricted"
					? "data-disabled:bg-trading-panel-neutral-disabled-fill data-disabled:text-trading-panel-on-disabled"
					: cn(!mobile && "focus-visible:outline-offset-1", getTradingCtaClass(variant)),
				className,
				iconLeft && (mobile ? (embedded ? "pl-3.5" : "pl-5.5") : "pl-1.5"),
			)}
		>
			{iconLeft}
			{label}
		</button>
	);
}
