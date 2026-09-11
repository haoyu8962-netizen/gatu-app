import type { ReactNode } from "react";
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
				"flex flex-1 flex-col",
				embedded
					? "min-h-min"
					: "min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
			)}
		>
			<div
				className={cn(
					embedded
						? "trade-panel-container flex-1 min-h-min flex flex-col gap-2 px-2.5 py-1.5 font-market-close"
						: "trade-panel-container px-3 py-4 space-y-4",
				)}
			>
				{children}
			</div>
		</div>
	);
}
