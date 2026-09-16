import type { ReactNode } from "react";

export const sizeSliderRow = "flex items-center gap-2 pt-0.5";

interface Props {
	slider: ReactNode;
	percent: ReactNode;
	mobile?: boolean;
}

export function TradeSizeSliderRowView({ slider, percent, mobile }: Props) {
	return (
		<div className={mobile ? sizeSliderRow : "flex items-start gap-2"}>
			<div className="relative min-w-0 flex-1">{slider}</div>
			{percent}
		</div>
	);
}
