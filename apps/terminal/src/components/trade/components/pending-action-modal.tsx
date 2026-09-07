import { AdaptiveModal } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
	children: ReactNode;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	presentation?: "modal" | "drawer";
	className?: string;
	handleClassName?: string;
	overlayClassName?: string;
}

export function PendingActionModal({
	children,
	isPending,
	onOpenChange,
	open,
	presentation = "modal",
	className,
	handleClassName,
	overlayClassName,
}: Props) {
	const { t } = useLingui();

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={onOpenChange}
			presentation={presentation}
			size="sm"
			dismissible={!isPending}
			showClose={!isPending}
			closeLabel={t`Close`}
			showHandle={presentation === "drawer"}
			handleClassName={cn("top-2 h-1 w-9 bg-fill/30", handleClassName)}
			overlayClassName={overlayClassName}
			className={cn(
				presentation === "drawer" && "max-h-[calc(100dvh-1rem)] overflow-y-auto !rounded-t-[18px]",
				className,
			)}
		>
			{children}
		</AdaptiveModal>
	);
}
