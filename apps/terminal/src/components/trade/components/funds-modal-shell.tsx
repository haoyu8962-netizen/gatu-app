import { Trans } from "@lingui/react/macro";
import { ModalContent, ModalHeader, ModalTitle } from "@sairn/ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
	FUNDS_MODAL_BODY_CLASS,
	FUNDS_MODAL_BODY_SLOT,
	FUNDS_MODAL_BODY_TOP_PADDING_CLASS,
	FUNDS_MODAL_HEADER_CLASS,
	FUNDS_MODAL_POPUP_CLASS,
} from "@/lib/ui/funds-modal-scroll";
import { PendingActionModal } from "./pending-action-modal";

interface Props {
	children: ReactNode;
	headerStart?: ReactNode;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	presentation: "modal" | "drawer";
	tab: "deposit" | "withdraw" | "bridge";
}

function FundsModalTitle({ tab }: Pick<Props, "tab">) {
	if (tab === "deposit") return <Trans>Deposit</Trans>;
	if (tab === "withdraw") return <Trans>Withdraw</Trans>;
	return <Trans>Bridge</Trans>;
}

export function FundsModalShell({ children, headerStart, isPending, onOpenChange, open, presentation, tab }: Props) {
	const usesFundsRedesign = tab !== "bridge";

	return (
		<PendingActionModal
			open={open}
			onOpenChange={onOpenChange}
			isPending={isPending}
			presentation={presentation}
			handleClassName={usesFundsRedesign ? "top-2.5 !rounded-[2px] bg-market-close-stroke-input" : undefined}
			overlayClassName={usesFundsRedesign ? "!bg-scrim/60 !backdrop-blur-none" : undefined}
			className={cn(
				FUNDS_MODAL_POPUP_CLASS,
				usesFundsRedesign &&
					"font-market-close max-[1000px]:!border-0 !bg-modal !shadow-none max-[1000px]:!rounded-t-[20px] [&>button]:!top-5 [&>button]:!right-4 [&>button]:!rounded-[8px] [&>button]:text-market-close-muted [&>button:hover]:bg-market-close-hover [&>button:hover]:text-market-close-fg [&>button:active]:bg-market-close-hover min-[1001px]:!max-w-[28rem] min-[1001px]:!rounded-[16px] min-[1001px]:!shadow-overlay min-[1001px]:[&>button]:!top-6 min-[1001px]:[&>button]:!right-6 min-[1001px]:[&>button>svg]:size-[18px]",
			)}
		>
			<ModalHeader
				divider={!usesFundsRedesign}
				className={cn(
					FUNDS_MODAL_HEADER_CLASS,
					usesFundsRedesign && "px-4 pt-7 pr-14 pb-0 text-start min-[1001px]:px-6 min-[1001px]:pr-14 min-[1001px]:pt-6",
				)}
			>
				{headerStart}
				<ModalTitle className={usesFundsRedesign ? "sr-only" : undefined}>
					<FundsModalTitle tab={tab} />
				</ModalTitle>
			</ModalHeader>

			<ModalContent
				data-slot={FUNDS_MODAL_BODY_SLOT}
				className={cn(
					FUNDS_MODAL_BODY_CLASS,
					usesFundsRedesign
						? cn(FUNDS_MODAL_BODY_TOP_PADDING_CLASS, "px-4 pb-5 min-[1001px]:px-6 min-[1001px]:pb-6")
						: "space-y-4",
				)}
			>
				{children}
			</ModalContent>
		</PendingActionModal>
	);
}
