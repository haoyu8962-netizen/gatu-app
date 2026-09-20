import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface PositionCloseSummaryItem {
	key: string;
	label: ReactNode;
	value: ReactNode;
	valueClassName?: string;
	emphasized?: boolean;
}

interface Props {
	testId: string;
	ariaLabel: string;
	items: PositionCloseSummaryItem[];
}

export function PositionCloseSummary({ testId, ariaLabel, items }: Props) {
	return (
		<section data-testid={testId} aria-label={ariaLabel} className="py-3 min-[1001px]:py-3.5">
			<div className="flex justify-between gap-2 min-[1001px]:block min-[1001px]:space-y-2.5">
				{items.map((item) => (
					<div
						key={item.key}
						className={cn(
							"flex min-w-0 flex-col gap-[3px] text-start min-[1001px]:flex-row min-[1001px]:items-center min-[1001px]:justify-between min-[1001px]:gap-4",
							item.emphasized && "items-end text-right min-[1001px]:items-center min-[1001px]:text-start",
							item.emphasized &&
								"min-[1001px]:border-t min-[1001px]:border-dashed min-[1001px]:border-market-close-stroke-card min-[1001px]:pt-2.5",
						)}
					>
						<span className="max-w-full truncate text-2xs leading-4 text-market-close-muted min-[1001px]:text-2sm min-[1001px]:leading-[18px]">
							{item.label}
						</span>
						<span
							className={cn(
								"max-w-full truncate text-sm leading-[18px] tabular-nums min-[1001px]:text-2sm",
								item.valueClassName,
							)}
						>
							{item.value}
						</span>
					</div>
				))}
			</div>
		</section>
	);
}
