import type { ReactNode } from "react";
import { getMobileOrderbookRowOffsetPx, MOBILE_ORDERBOOK_ROW_METRICS } from "./mobile-orderbook-layout";

interface Props {
	children: ReactNode;
	price?: string;
	rank: number;
	side: "ask" | "bid";
}

export function CompactOrderbookRowPosition({ children, price, rank, side }: Props) {
	const metrics = MOBILE_ORDERBOOK_ROW_METRICS.compact;
	const offsetPx = getMobileOrderbookRowOffsetPx(rank, metrics);

	return (
		<div
			data-slot="compact-orderbook-row-position"
			data-side={side}
			data-price={price}
			data-rank={rank}
			className="absolute inset-x-0"
			style={{
				[side === "ask" ? "bottom" : "top"]: 0,
				height: metrics.rowHeightPx,
				transform: `translateY(${side === "ask" ? -offsetPx : offsetPx}px)`,
			}}
		>
			{children}
		</div>
	);
}
