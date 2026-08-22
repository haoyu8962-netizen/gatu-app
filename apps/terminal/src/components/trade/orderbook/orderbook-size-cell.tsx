import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { compareOrderbookValues } from "@/lib/trade/orderbook";

interface Props {
	className?: string;
	displayValue: string;
	resetKey: string;
	value: string;
}

export function OrderbookSizeCell({ className, displayValue, resetKey, value }: Props) {
	const previousRef = useRef({ resetKey, value });
	const previous = previousRef.current;
	const comparison =
		resetKey === previous.resetKey && value !== previous.value ? compareOrderbookValues(previous.value, value) : null;
	const direction = comparison === null || comparison === 0 ? null : comparison > 0 ? "up" : "down";

	useEffect(() => {
		previousRef.current = { resetKey, value };
	}, [resetKey, value]);

	return (
		<span className={className} title={displayValue}>
			<span
				key={`${resetKey}:${value}`}
				data-direction={direction ?? undefined}
				data-slot="orderbook-size-value"
				className={cn(direction && "orderbook-color-change")}
			>
				{displayValue}
			</span>
		</span>
	);
}
