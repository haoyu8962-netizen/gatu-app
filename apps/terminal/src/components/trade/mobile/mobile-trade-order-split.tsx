import type { ReactNode } from "react";
import * as mobileChrome from "@/components/trade/mobile/mobile-chrome-classes";

interface Props {
	children: ReactNode;
	orderbook: ReactNode;
}

export function MobileTradeOrderSplit({ children, orderbook }: Props) {
	return (
		<div data-slot="mobile-trade-order-split" className={mobileChrome.tradeSplit}>
			{children}
			<div className={mobileChrome.bookColumn}>{orderbook}</div>
		</div>
	);
}
