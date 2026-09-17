import type { ReactNode } from "react";

interface Props {
	label: ReactNode;
	value?: ReactNode;
	action?: ReactNode;
	positionLabel?: ReactNode;
	positionValue?: ReactNode;
}

export function TradeAvailableRowView({ label, value, action, positionLabel, positionValue }: Props) {
	return (
		<div className="flex min-w-0 items-baseline justify-between gap-2 text-xs leading-snug">
			<div className="inline-flex min-w-0 flex-1 items-baseline gap-x-1.5">
				{label}
				<span className="inline-flex min-w-0 items-center">{value}</span>
				{action}
			</div>
			{positionLabel != null && (
				<div className="inline-flex min-w-0 shrink-0 items-baseline gap-x-1.5">
					{positionLabel}
					{positionValue}
				</div>
			)}
		</div>
	);
}
