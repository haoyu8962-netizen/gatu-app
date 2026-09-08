import { cn } from "@/lib/cn";

interface Props {
	compact?: boolean;
}

export function OrderbookPlaceholderRow({ compact }: Props) {
	return (
		<div
			data-slot="orderbook-placeholder-row"
			className={cn(
				"shrink-0",
				compact ? "h-[var(--orderbook-row-height,24px)]" : "h-[var(--orderbook-row-height,23px)]",
			)}
			aria-hidden="true"
		/>
	);
}
