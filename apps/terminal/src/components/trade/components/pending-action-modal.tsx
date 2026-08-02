import { Modal, ModalPopup } from "@gatu/ui";
import type { ReactNode } from "react";

interface Props {
	children: ReactNode;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

export function PendingActionModal({ children, isPending, onOpenChange, open }: Props) {
	function handleOpenChange(nextOpen: boolean, eventDetails: { cancel: () => void }) {
		if (isPending && !nextOpen) {
			eventDetails.cancel();
			return;
		}

		onOpenChange(nextOpen);
	}

	return (
		<Modal open={open} onOpenChange={handleOpenChange} disablePointerDismissal={isPending}>
			<ModalPopup size="sm" showClose={!isPending}>
				{children}
			</ModalPopup>
		</Modal>
	);
}
