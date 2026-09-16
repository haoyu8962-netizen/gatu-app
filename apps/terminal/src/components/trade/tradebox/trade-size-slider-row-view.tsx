import type { ReactNode } from "react";

interface Props {
	slider: ReactNode;
	percent: ReactNode;
}

export function TradeSizeSliderRowView({ slider, percent }: Props) {
	return (
		<div className="flex items-start gap-2">
			<div className="relative min-w-0 flex-1">{slider}</div>
			{percent}
		</div>
	);
}
