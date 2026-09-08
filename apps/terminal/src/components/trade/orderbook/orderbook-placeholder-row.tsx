import { cn } from "@/lib/cn";

interface Props {
	compact?: boolean;
}

export function OrderbookPlaceholderRow({ compact }: Props) {
	return (
		<div
			data-slot="orderbook-placeholder-row"
			className={cn("shrink-0", compact ? "h-[24px]" : "h-[23px]")}
			aria-hidden="true"
		/>
	);
}
