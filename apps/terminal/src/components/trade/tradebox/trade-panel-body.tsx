import type { ReactNode } from "react";

interface Props {
	children: ReactNode;
	footer: ReactNode;
}

export function TradePanelBody({ children, footer }: Props) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div data-grid-content-part className="flex shrink-0 flex-col gap-5 px-3 pt-3">
				{children}
			</div>
			<div data-grid-content-part className="mt-auto flex shrink-0 flex-col gap-4 px-3 pt-10 pb-4">
				{footer}
			</div>
		</div>
	);
}
