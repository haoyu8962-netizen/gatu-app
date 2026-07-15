import { useState } from "react";
import { cn } from "@/lib/cn";

interface Props {
	className?: string;
	displayValue: string;
	resetKey: string;
	value: number;
}

interface FlashState {
	direction: "up" | "down" | null;
	resetKey: string;
	sequence: number;
	value: number;
}

export function OrderbookSizeCell({ className, displayValue, resetKey, value }: Props) {
	const [flash, setFlash] = useState<FlashState>({ direction: null, resetKey, sequence: 0, value });

	if (resetKey !== flash.resetKey) {
		setFlash({ direction: null, resetKey, sequence: flash.sequence + 1, value });
	} else if (value !== flash.value) {
		setFlash({
			direction: value > flash.value ? "up" : "down",
			resetKey,
			sequence: flash.sequence + 1,
			value,
		});
	}

	return (
		<div className={className}>
			<span
				key={flash.sequence}
				data-direction={flash.direction ?? undefined}
				data-slot="orderbook-size-value"
				className={cn(flash.direction && "orderbook-color-change")}
			>
				{displayValue}
			</span>
		</div>
	);
}
