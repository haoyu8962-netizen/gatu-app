import type { ReactNode } from "react";

interface Props {
	actions: ReactNode;
	summary: ReactNode;
}

export function TradePanelFooterView({ actions, summary }: Props) {
	return (
		<>
			<div className="flex flex-col gap-3">{actions}</div>
			<div className="border-t border-trading-panel-stroke-row pt-1">{summary}</div>
		</>
	);
}
