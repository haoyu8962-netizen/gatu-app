import type { ReactNode } from "react";
import { StatBlock } from "./chart/stat-block";

interface Props {
	stats: readonly {
		id: string;
		label: ReactNode;
		value: ReactNode | null;
		valueSample?: string;
		labelClass?: string;
		valueClass?: string;
	}[];
	ariaLabel: string;
	dataset?: boolean;
}

const KEYBOARD_SCROLL_REGION_PROPS = { tabIndex: 0 } as const;

export function MarketOverviewView({ stats, ariaLabel, dataset = true }: Props) {
	return (
		<section
			data-market-overview=""
			aria-label={ariaLabel}
			{...KEYBOARD_SCROLL_REGION_PROPS}
			className="relative w-full min-w-0 touch-pan-x overflow-x-auto overflow-y-hidden overscroll-x-contain font-market-close text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-stroke-focus [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			<div data-market-overview-row="" className="relative flex items-center gap-8">
				{stats.map(({ id, ...stat }) => (
					<div key={id} data-market-stat={dataset ? id : undefined} className="shrink-0">
						<StatBlock {...stat} />
					</div>
				))}
			</div>
		</section>
	);
}
