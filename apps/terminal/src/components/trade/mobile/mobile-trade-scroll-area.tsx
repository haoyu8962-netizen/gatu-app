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
				"flex flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
				embedded ? "min-h-32" : "min-h-0",
			)}
		>
			<div
				className={cn(
					embedded
						? "trade-panel-container flex-1 min-h-min flex flex-col justify-between px-2.5 py-1.5 space-y-2 font-market-close"
						: "trade-panel-container px-3 py-4 space-y-4",
				)}
			>
				{children}
			</div>
		</div>
	);
}
