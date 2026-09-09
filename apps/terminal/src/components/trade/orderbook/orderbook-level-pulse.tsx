import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { OrderbookLevelPulseEvent } from "@/lib/ui/orderbook-level-pulses";

interface Props {
	event: OrderbookLevelPulseEvent;
	onAnimationEnd: (id: number) => void;
}

export function OrderbookLevelPulse({ event, onAnimationEnd }: Props) {
	const elementRef = useRef<HTMLSpanElement>(null);

	useLayoutEffect(() => {
		const element = elementRef.current;
		if (!element) return;
		const now = performance.now();
		if (now >= event.expiresAt) {
			onAnimationEnd(event.id);
			return;
		}
		element.style.setProperty("--orderbook-pulse-delay", `${event.createdAt + event.delayMs - now}ms`);
		element.dataset.active = "true";
		return () => {
			delete element.dataset.active;
			element.style.removeProperty("--orderbook-pulse-delay");
		};
	}, [event, onAnimationEnd]);

	return (
		<span
			ref={elementRef}
			aria-hidden="true"
			data-slot="orderbook-level-pulse"
			data-event-id={event.id}
			data-side={event.side}
			className={cn(
				"orderbook-level-pulse",
				event.side === "ask" ? "orderbook-level-pulse-ask" : "orderbook-level-pulse-bid",
			)}
			onAnimationEnd={() => onAnimationEnd(event.id)}
		/>
	);
}
