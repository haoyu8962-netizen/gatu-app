import { ModalContent } from "@sairn/ui";
import type { ReactNode } from "react";

interface Props {
	children: ReactNode;
}

export function PositionCloseDialogContent({ children }: Props) {
	return (
		<ModalContent className="flex flex-col gap-3.5 px-5 pt-3.5 pb-0 min-[1001px]:gap-5 min-[1001px]:px-6 min-[1001px]:pt-5">
			{children}
		</ModalContent>
	);
}
