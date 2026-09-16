import type { ReactNode } from "react";

interface Props {
	title: string;
	children: ReactNode;
}

export function AccountPanelFrameView({ title, children }: Props) {
	return (
		<div className="flex h-full min-h-[459px] min-w-0 flex-col bg-surface">
			<h2 className="sr-only">{title}</h2>
			{children}
		</div>
	);
}
