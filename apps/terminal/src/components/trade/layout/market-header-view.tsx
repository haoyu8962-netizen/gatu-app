import type { ReactNode } from "react";

interface Props {
	head: ReactNode;
	socials?: ReactNode;
	overview: ReactNode;
}

export function MarketHeaderView({ head, socials, overview }: Props) {
	return (
		<div
			data-market-header=""
			className="flex h-full min-w-0 items-center overflow-hidden border-b border-trading-panel-stroke-row bg-surface px-4 font-market-close text-trading-panel-fg"
		>
			<div className="flex h-full shrink-0 items-center">{head}</div>
			{socials ? <div className="ms-6">{socials}</div> : null}
			<div className="ms-6 min-w-0 flex-1 overflow-hidden">{overview}</div>
		</div>
	);
}
