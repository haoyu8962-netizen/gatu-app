import { Button, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@sairn/ui";
import type { ReactNode } from "react";

interface SecondaryAction {
	label: ReactNode;
	disabled: boolean;
	onAction: () => void;
}

interface Props {
	title: ReactNode;
	description: ReactNode;
	actionLabel: ReactNode;
	actionDisabled?: boolean;
	onAction: () => void;
	secondaryAction?: SecondaryAction;
}

export function LegalStatusMessage({
	title,
	description,
	actionLabel,
	actionDisabled = false,
	onAction,
	secondaryAction,
}: Props) {
	return (
		<>
			<ModalHeader divider={false} className="px-6 pt-5 pb-2">
				<ModalTitle className="text-lg font-normal">{title}</ModalTitle>
			</ModalHeader>
			<ModalContent className="px-6 pt-0 pb-4">
				<ModalDescription className="text-sm leading-5 text-fg-muted">{description}</ModalDescription>
			</ModalContent>
			<ModalFooter className="flex-col gap-2 px-6 pt-0 pb-5">
				<Button type="button" size="md" className="w-full" disabled={actionDisabled} onClick={onAction}>
					{actionLabel}
				</Button>
				{secondaryAction ? (
					<Button
						type="button"
						variant="outline"
						intent="neutral"
						size="md"
						className="w-full"
						disabled={secondaryAction.disabled}
						onClick={secondaryAction.onAction}
					>
						{secondaryAction.label}
					</Button>
				) : null}
			</ModalFooter>
		</>
	);
}
