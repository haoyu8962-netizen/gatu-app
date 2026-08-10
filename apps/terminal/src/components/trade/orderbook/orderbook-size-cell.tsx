import { useState } from "react";
import { cn } from "@/lib/cn";
import { compareOrderbookValues } from "@/lib/trade/orderbook";

interface Props {
	className?: string;
	displayValue: string;
	resetKey: string;
	value: string;
}

interface FlashState {
	direction: "up" | "down" | null;
	resetKey: string;
	sequence: number;
	value: string;
}

export function OrderbookSizeCell({ className, displayValue, resetKey, value }: Props) {
	const [flash, setFlash] = useState<FlashState>({ direction: null, resetKey, sequence: 0, value });

	if (resetKey !== flash.resetKey) {
		setFlash({ direction: null, resetKey, sequence: flash.sequence + 1, value });
	} else if (value !== flash.value) {
		const comparison = compareOrderbookValues(flash.value, value);
		setFlash({
			direction: comparison === null || comparison === 0 ? null : comparison > 0 ? "up" : "down",
			resetKey,
			sequence: flash.sequence + 1,
			value,
		});
	}

	return (
		<span className={className} title={displayValue}>
			<span
				key={flash.sequence}
				data-direction={flash.direction ?? undefined}
				data-slot="orderbook-size-value"
				className={cn(flash.direction && "orderbook-color-change")}
			>
				{displayValue}
			</span>
		</span>
	);
}
