import { AdaptiveModal } from "@gatu/ui";
import type { ReactNode } from "react";

interface Props {
	children: ReactNode;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	presentation?: "modal" | "drawer";
}

export function PendingActionModal({ children, isPending, onOpenChange, open, presentation = "modal" }: Props) {
	return (
		<AdaptiveModal
			open={open}
			onOpenChange={onOpenChange}
			presentation={presentation}
			size="sm"
			dismissible={!isPending}
			showClose={!isPending}
			showHandle={presentation === "drawer"}
			handleClassName="top-2 h-1 w-9 bg-fill/30"
			className={presentation === "drawer" ? "max-h-[calc(100dvh-1rem)] overflow-y-auto !rounded-t-[18px]" : undefined}
		>
			{children}
		</AdaptiveModal>
	);
}
