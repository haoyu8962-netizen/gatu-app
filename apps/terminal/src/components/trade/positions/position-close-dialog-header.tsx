import { ModalHeader } from "@gatu/ui";
import type { ReactNode } from "react";

interface Props {
	children: ReactNode;
}

export function PositionCloseDialogHeader({ children }: Props) {
	return (
		<ModalHeader divider={false} className="gap-1 px-5 pt-7 pb-0 text-start min-[1001px]:px-6 min-[1001px]:pt-6">
			{children}
		</ModalHeader>
	);
}
