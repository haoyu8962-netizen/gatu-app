import { AdaptiveModal } from "@gatu/ui";
import type { ReactNode } from "react";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onOpenChangeComplete?: (open: boolean) => void;
	isMobile: boolean;
	dismissible: boolean;
	closeLabel: string;
	children: ReactNode;
}

export function PositionCloseDialogShell({
	open,
	onOpenChange,
	onOpenChangeComplete,
	isMobile,
	dismissible,
	closeLabel,
	children,
}: Props) {
	return (
		<AdaptiveModal
			open={open}
			onOpenChange={onOpenChange}
			onOpenChangeComplete={onOpenChangeComplete}
			presentation={isMobile ? "drawer" : "modal"}
			size="lg"
			dismissible={dismissible}
			showClose={dismissible}
			showHandle={isMobile && dismissible}
			closeLabel={closeLabel}
			handleClassName="top-2.5 h-1 w-9 !rounded-[2px] bg-market-close-stroke-input"
			overlayClassName="!bg-scrim/60 !backdrop-blur-none"
			className="font-market-close max-h-[calc(100dvh-1rem)] !rounded-t-[20px] max-[1000px]:!border-0 max-[1000px]:[&>button]:top-6 max-[1000px]:[&>button]:right-3 max-[1000px]:[&>button]:text-market-close-muted !shadow-none min-[1001px]:max-w-[27.5rem] min-[1001px]:!rounded-[16px] min-[1001px]:!shadow-overlay min-[1001px]:[&>button]:!top-6 min-[1001px]:[&>button]:!right-6 min-[1001px]:[&>button]:!rounded-[8px] min-[1001px]:[&>button]:text-market-close-muted min-[1001px]:[&>button:hover]:bg-market-close-hover min-[1001px]:[&>button:hover]:text-market-close-fg min-[1001px]:[&>button:active]:bg-market-close-hover min-[1001px]:[&>button>svg]:size-[18px]"
		>
			{children}
		</AdaptiveModal>
	);
}
