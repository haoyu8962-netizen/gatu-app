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
			<span className={cn(className, "underline decoration-dotted underline-offset-2")}>
				{status.label}
				<span className="sr-only">, {status.reason}</span>
			</span>
		</Tooltip>
	);
}
