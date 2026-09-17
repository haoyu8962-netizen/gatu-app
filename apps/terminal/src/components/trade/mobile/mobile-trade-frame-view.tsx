import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const tradeSplit = "flex min-h-[clamp(370px,60svh,480px)] w-full min-w-0 items-stretch";
export const bookColumn = "relative min-w-0 flex-1 self-stretch";
export const tradeScroll = "flex flex-1 flex-col";
export const tradeEmbeddedContent =
	"trade-panel-container flex-1 min-h-min flex flex-col gap-2 px-2.5 py-1.5 font-market-close";
export const tradeColumn = "flex-[1.53] min-w-0 border-r border-stroke-weak/60";
export const tradeView = "flex min-h-0 flex-col self-stretch";

interface Props {
	children: ReactNode;
	orderbook: ReactNode;
}
export function MobileTradeOrderSplitView({ children, orderbook }: Props) {
	return (
		<div data-slot="mobile-trade-order-split" className={tradeSplit}>
			{children}
			<div className={bookColumn}>{orderbook}</div>
		</div>
	);
}
export function MobileTradeFrameView({
	children,
	embedded,
	className,
}: {
	children: ReactNode;
	embedded?: boolean;
	className?: string;
}) {
	return <div className={cn(tradeView, !embedded && "h-full bg-background", className)}>{children}</div>;
}
export function MobileTradeScrollAreaView({ children, embedded }: { children: ReactNode; embedded?: boolean }) {
	return (
		<div
			data-slot="mobile-order-entry-scroll"
			className={cn(
				tradeScroll,
				embedded
					? "min-h-min"
					: "min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
			)}
		>
			<div
				data-slot="mobile-order-entry-content"
				className={cn(embedded ? tradeEmbeddedContent : "trade-panel-container px-3 py-4 space-y-4")}
			>
				{children}
			</div>
		</div>
	);
}
