import type { ReactNode } from "react";

interface Props {
	header: ReactNode;
	fields: ReactNode;
	overlays?: ReactNode;
	footer: ReactNode;
	onIntent?: () => void;
}

export const TRADE_PANEL_CLASS = "trade-panel-container flex h-full flex-col bg-surface font-market-close";

export function TradePanelBodyView({ header, fields, footer, overlays, onIntent }: Props) {
	return (
		<div
			className={TRADE_PANEL_CLASS}
			onPointerEnter={onIntent}
			onPointerDownCapture={onIntent}
			onFocusCapture={onIntent}
		>
			{overlays}
			<div className="flex min-h-0 flex-1 flex-col">
				<div data-slot="trade-panel-header" className="shrink-0 px-3 pt-3">
					{header}
				</div>
				<div data-slot="trade-panel-body" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
					<div data-slot="trade-panel-fields" className="min-h-0 flex-[1_0_auto]">
						<div className="flex flex-col px-3 pt-2">{fields}</div>
					</div>
					<div data-slot="trade-panel-footer" className="flex shrink-0 flex-col gap-2 px-3 py-3">
						{footer}
					</div>
				</div>
			</div>
		</div>
	);
}
