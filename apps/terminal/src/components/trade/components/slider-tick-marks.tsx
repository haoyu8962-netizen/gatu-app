import { cn } from "@/lib/cn";

interface Props {
	positions: ReadonlyArray<{ key: number; leftPercent: number; active: boolean }>;
	activeClassName: string;
	insetClassName: string;
}

export function SliderTickMarks({ positions, activeClassName, insetClassName }: Props) {
	return (
		<div className={cn("pointer-events-none absolute top-1/2 h-0 -translate-y-1/2", insetClassName)}>
			{positions.map((position) => (
				<span
					key={position.key}
					style={{ left: `${position.leftPercent}%` }}
					className={cn(
						"absolute top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2",
						position.active ? activeClassName : "border-trading-panel-stroke-input bg-surface",
					)}
				/>
			))}
		</div>
	);
}
