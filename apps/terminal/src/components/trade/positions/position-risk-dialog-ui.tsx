import { AdaptiveModal } from "@sairn/ui";
import type { ReactNode } from "react";

interface PositionRiskDialogShellProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	isMobile: boolean;
	dismissible: boolean;
	children: ReactNode;
}

export function PositionRiskDialogShell({
	open,
	onOpenChange,
	isMobile,
	dismissible,
	children,
}: PositionRiskDialogShellProps) {
	return (
		<AdaptiveModal
			open={open}
			onOpenChange={onOpenChange}
			presentation={isMobile ? "drawer" : "modal"}
			size="sm"
			dismissible={dismissible}
			showClose={false}
			showHandle={isMobile && dismissible}
			handleClassName="top-2 h-1 w-9 !rounded-[2px] bg-market-close-stroke-input"
			className="font-market-close max-[1000px]:max-h-[calc(100dvh-1rem)] max-[1000px]:!rounded-t-[18px] max-[1000px]:!bg-modal max-[1000px]:!shadow-none"
		>
			{children}
		</AdaptiveModal>
	);
}
