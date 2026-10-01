import { ModalFooter } from "@sairn/ui";
import type { ReactNode } from "react";

interface Props {
	children: ReactNode;
}

export function PositionCloseDialogFooter({ children }: Props) {
	return (
		<ModalFooter className="flex-col items-stretch gap-2 px-5 pt-3.5 pb-5 min-[1001px]:px-6 min-[1001px]:pt-5 min-[1001px]:pb-6">
			{children}
		</ModalFooter>
	);
}
