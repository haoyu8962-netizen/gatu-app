import type { ReactNode } from "react";

interface Props {
	available: ReactNode;
	prices?: ReactNode;
	size: ReactNode;
	sizeError?: ReactNode;
	slider: ReactNode;
	additional?: ReactNode;
	options?: ReactNode;
}

export function TradeFormFieldsView({ available, prices, size, sizeError, slider, additional, options }: Props) {
	return (
		<div className="flex min-w-0 flex-col gap-2">
			<div className="flex min-w-0 flex-col gap-2">
				{available}
				{prices}
				<div className="flex flex-col gap-2">
					{size}
					{sizeError}
					{slider}
				</div>
				{additional}
			</div>
			{options}
		</div>
	);
}
