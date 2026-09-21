import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const ctaWrapper = "shrink-0 border-t border-trading-panel-stroke-card bg-surface";
export const ctaEmbeddedPadding = "px-2.5 py-2";
export const ctaButton = "w-full rounded-[10px] text-sm font-bold whitespace-nowrap shadow-none";
export const ctaEmbeddedHeight = "h-[38px]";
export const ctaConnect =
	"bg-trading-panel-control text-trading-panel-on-control hover:not-data-disabled:bg-trading-panel-control/90";
export const ctaConnectDark = "dark:bg-fill-weak dark:text-action dark:hover:not-data-disabled:bg-fill-press";
export const buttonFilledBrandMd =
	"inline-flex items-center justify-center gap-2 select-none py-2 px-4 bg-action text-on-action";

interface Props {
	children: ReactNode;
	embedded?: boolean;
}
export function MobileTradeCtaFrameView({ children, embedded }: Props) {
	return (
		<div data-slot="mobile-order-cta" className={cn(ctaWrapper, embedded ? ctaEmbeddedPadding : "px-3 py-3")}>
			{children}
		</div>
	);
}
