import type { ReactNode } from "react";
import * as mobileChrome from "@/components/trade/mobile/mobile-chrome-classes";
import { cn } from "@/lib/cn";

interface Props {
	children: ReactNode;
	embedded?: boolean;
}

export function MobileTradeScrollArea({ children, embedded }: Props) {
	return (
		<div
			data-slot="mobile-order-entry-scroll"
			className={cn(
				mobileChrome.tradeScroll,
				embedded
					? "min-h-min"
					: "min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
			)}
		>
			<div className={cn(embedded ? mobileChrome.tradeEmbeddedContent : "trade-panel-container px-3 py-4 space-y-4")}>
				{children}
			</div>
		</div>
	);
}
