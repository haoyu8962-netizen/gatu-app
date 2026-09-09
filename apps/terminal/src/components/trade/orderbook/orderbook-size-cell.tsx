import { useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/ui/use-prefers-reduced-motion";
import { cn } from "@/lib/cn";
import { compareOrderbookValues } from "@/lib/trade/orderbook";
import { useAnimateOrderbook } from "@/stores/use-global-settings-store";

interface Props {
	className?: string;
	displayValue: string;
	resetKey: string;
	value: string;
}

interface AnimationState {
	direction: "up" | "down" | null;
	enabled: boolean;
	resetKey: string;
	sequence: number;
	value: string;
}

export function OrderbookSizeCell({ className, displayValue, resetKey, value }: Props) {
	const animateOrderbook = useAnimateOrderbook();
	const reducedMotion = usePrefersReducedMotion();
	const enabled = animateOrderbook && !reducedMotion;
	const [animation, setAnimation] = useState<AnimationState>({
		direction: null,
		enabled,
		resetKey,
		sequence: 0,
		value,
	});

	if (animation.resetKey !== resetKey || animation.enabled !== enabled || animation.value !== value) {
		const comparison =
			enabled && animation.enabled && animation.resetKey === resetKey
				? compareOrderbookValues(animation.value, value)
				: null;
		const direction =
			comparison === 0 ? animation.direction : comparison === null ? null : comparison > 0 ? "up" : "down";
		setAnimation({
			direction,
			enabled,
			resetKey,
			sequence: animation.sequence + (comparison === 0 ? 0 : 1),
			value,
		});
	}

	return (
		<span className={className} title={displayValue}>
			<span
				key={animation.sequence}
				data-direction={animation.direction ?? undefined}
				data-slot="orderbook-size-value"
				className={cn(animation.direction && "orderbook-color-change")}
				onAnimationEnd={(event) => {
					if (event.target !== event.currentTarget || event.animationName !== "orderbook-color-change") return;
					setAnimation((current) =>
						current.sequence === animation.sequence && current.direction ? { ...current, direction: null } : current,
					);
				}}
			>
				{displayValue}
			</span>
		</span>
	);
}
