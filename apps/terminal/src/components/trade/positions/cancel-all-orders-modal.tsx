import { AdaptiveModal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@gatu/ui";
import { Plural, useLingui } from "@lingui/react/macro";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
	open: boolean;
	orderCount: number;
	isSubmitting: boolean;
	errorMessage?: string | null;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function CancelAllOrdersModal({ open, orderCount, isSubmitting, errorMessage, onOpenChange, onConfirm }: Props) {
	const { t } = useLingui();
	const isMobile = useIsMobile();

	function handleConfirm() {
		if (isSubmitting || orderCount === 0) return;
		onConfirm();
	}

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={onOpenChange}
			presentation={isMobile ? "drawer" : "modal"}
			size="sm"
			dismissible={!isSubmitting}
			showClose={false}
			showHandle={isMobile}
			handleClassName="top-2 h-1 w-9 !rounded-[2px] bg-market-close-stroke-input"
			overlayClassName="!bg-scrim/60 !backdrop-blur-none"
			className="font-market-close max-h-[calc(100dvh-1rem)] !rounded-t-[18px] max-[1000px]:!border-0 !bg-modal !shadow-none min-[1001px]:max-w-[21.25rem] min-[1001px]:!rounded-[16px] min-[1001px]:!shadow-overlay"
		>
			<ModalHeader
				divider={false}
				className="gap-3 px-4 pt-7 pb-0 text-start min-[1001px]:gap-1 min-[1001px]:px-6 min-[1001px]:pt-6"
			>
				<ModalTitle className="text-base leading-[22px] font-bold text-market-close-fg min-[1001px]:text-[17px] min-[1001px]:leading-6">
					{t`Cancel All Orders`}
				</ModalTitle>
				<ModalDescription className="text-[13px] leading-5 text-market-close-muted">
					<Plural
						value={orderCount}
						one="This will cancel the open order, including protective stop orders. Your position may no longer be protected."
						other="This will cancel all # open orders, including protective stop orders. Your positions will no longer be protected."
					/>
				</ModalDescription>
			</ModalHeader>
			{errorMessage ? (
				<ModalContent className="px-4 pt-3 pb-0 min-[1001px]:px-6">
					<p role="alert" className="text-xs leading-[17px] text-market-close-danger">
						{errorMessage}
					</p>
				</ModalContent>
			) : null}
			<ModalFooter className="grid grid-cols-2 gap-2 px-4 pt-3 pb-4 min-[1001px]:px-6 min-[1001px]:pt-4 min-[1001px]:pb-6">
				<button
					type="button"
					className="min-h-11 rounded-[10px] border border-market-close-stroke-input bg-modal px-3 text-[13px] font-semibold text-market-close-fg transition-colors duration-[120ms] hover:border-market-close-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus disabled:cursor-not-allowed disabled:text-market-close-subtle min-[1001px]:min-h-10"
					disabled={isSubmitting}
					onClick={() => onOpenChange(false)}
				>
					{t`Back`}
				</button>
				<button
					type="button"
					className="min-h-11 rounded-[10px] bg-market-close-danger px-3 text-[13px] font-bold text-market-close-danger-text transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus disabled:cursor-not-allowed disabled:bg-market-close-danger-disabled disabled:text-market-close-muted min-[1001px]:min-h-10"
					aria-busy={isSubmitting}
					disabled={isSubmitting || orderCount === 0}
					onClick={handleConfirm}
				>
					{isSubmitting ? t`Canceling...` : t`Cancel All`}
				</button>
			</ModalFooter>
		</AdaptiveModal>
	);
}
