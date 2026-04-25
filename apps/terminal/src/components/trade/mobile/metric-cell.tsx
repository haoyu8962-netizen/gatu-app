import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
	label: ReactNode;
	value: ReactNode;
	valueClass?: string;
}

export function MetricCell({ label, value, valueClass }: Props) {
	return (
		<div className="px-2.5 py-1.5">
			<div className="text-xs text-fg-muted">{label}</div>
			<div className={cn("text-xs tabular-nums font-medium", valueClass)}>{value}</div>
		</div>
	);
}
