import { useState } from "react";
import { cn } from "@/lib/cn";

interface Props {
	className?: string;
	displayValue: string;
	value: number;
}

interface FlashState {
	direction: "up" | "down" | null;
	sequence: number;
	value: number;
}

export function OrderbookSizeCell({ className, displayValue, value }: Props) {
	const [flash, setFlash] = useState<FlashState>({ direction: null, sequence: 0, value });

	if (value !== flash.value) {
		setFlash({
			direction: value > flash.value ? "up" : "down",
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
