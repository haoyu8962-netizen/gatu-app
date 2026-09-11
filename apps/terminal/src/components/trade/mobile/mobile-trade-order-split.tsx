import type { ReactNode } from "react";

interface Props {
	children: ReactNode;
	orderbook: ReactNode;
}

export function MobileTradeOrderSplit({ children, orderbook }: Props) {
	return (
		<div
			data-slot="mobile-trade-order-split"
			className="flex min-h-[clamp(370px,60svh,480px)] w-full min-w-0 items-stretch"
		>
			{children}
			<div className="relative min-w-0 flex-1 self-stretch">{orderbook}</div>
		</div>
	);
}
