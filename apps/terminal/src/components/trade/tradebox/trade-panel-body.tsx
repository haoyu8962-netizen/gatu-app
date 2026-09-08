import type { ReactNode } from "react";

interface Props {
	children: ReactNode;
	footer: ReactNode;
}

export function TradePanelBody({ children, footer }: Props) {
	return (
		<div data-slot="trade-panel-body" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
			<div data-slot="trade-panel-fields" className="min-h-32 flex-1 overflow-y-auto overscroll-y-contain">
				<div className="flex flex-col gap-5 px-3 pt-3">{children}</div>
			</div>
			<div data-slot="trade-panel-footer" className="flex shrink-0 flex-col gap-4 px-3 pt-10 pb-4">
				{footer}
			</div>
		</div>
	);
}
