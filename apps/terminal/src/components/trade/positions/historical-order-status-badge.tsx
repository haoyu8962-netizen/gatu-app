import { Tooltip } from "@sairn/ui";
import type { HistoricalOrderStatusPresentation } from "@/hooks/trade/use-order-display-labels";
import { cn } from "@/lib/cn";

interface Props {
	status: HistoricalOrderStatusPresentation;
	className: string;
}

export function HistoricalOrderStatusBadge({ status, className }: Props) {
	if (!status.reason) return <span className={className}>{status.label}</span>;
	return (
		<Tooltip content={status.reason}>
			<button
				type="button"
				className={cn(
					className,
					"cursor-help border-0 underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stroke-focus",
				)}
			>
				{status.label}
				<span className="sr-only">, {status.reason}</span>
			</button>
		</Tooltip>
	);
}
