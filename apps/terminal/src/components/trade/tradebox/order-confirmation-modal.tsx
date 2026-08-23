import {
	AdaptiveModal,
	Button,
	Checkbox,
	ModalContent,
	ModalDescription,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import {
	buildOrderConfirmationRows,
	type OrderConfirmationDraft,
	type OrderConfirmationTone,
} from "@/domain/trade/order-confirmation";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { getTradingCtaClass, getTradingCtaIntent } from "@/lib/ui/trading-cta";
import { TradingActionButton } from "../components/trading-action-button";

interface Props {
	open: boolean;
	draft: OrderConfirmationDraft;
	isSubmitting: boolean;
	dontShowAgain: boolean;
	onDontShowAgainChange: (next: boolean) => void;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
}

export function OrderConfirmationModal({
	open,
	draft,
	isSubmitting,
	dontShowAgain,
	onDontShowAgainChange,
	onConfirm,
	onOpenChange,
}: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const rows = buildOrderConfirmationRows(draft);

	function handleOpenChange(nextOpen: boolean) {
		if (isSubmitting && !nextOpen) return;
		onOpenChange(nextOpen);
	}

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={handleOpenChange}
			presentation={isMobile ? "drawer" : "modal"}
			size="sm"
			dismissible={!isSubmitting}
			showClose={!isSubmitting}
			showHandle={isMobile}
			closeLabel={t`Close order confirmation`}
			handleClassName="top-2 h-1 w-9 !rounded-[2px] bg-market-close-stroke-input"
			overlayClassName="!bg-scrim/60 !backdrop-blur-none !transition-none data-starting-style:!opacity-100 data-ending-style:!opacity-100"
			className="font-market-close max-h-[calc(100dvh-1rem)] !rounded-t-[18px] !border-0 !bg-modal !shadow-none !transition-none data-starting-style:!translate-y-0 data-starting-style:!scale-100 data-starting-style:!opacity-100 data-ending-style:!translate-y-0 data-ending-style:!scale-100 data-ending-style:!opacity-100 [&>button]:!top-5 [&>button]:!right-4 [&>button]:!rounded-[8px] [&>button]:text-market-close-muted [&>button:hover]:bg-market-close-hover [&>button:hover]:text-market-close-fg [&>button:active]:bg-market-close-hover min-[1001px]:max-w-[23.75rem] min-[1001px]:!rounded-[16px] min-[1001px]:!shadow-overlay min-[1001px]:[&>button]:!top-6 min-[1001px]:[&>button]:!right-6"
		>
			<ModalHeader divider={false} className="gap-1 px-4 pt-7 pb-0 text-left min-[1001px]:px-6 min-[1001px]:pt-6">
				<ModalTitle className="text-base leading-[22px] font-bold text-market-close-fg min-[1001px]:text-[17px] min-[1001px]:leading-6">
					{t`Confirm Order`}
				</ModalTitle>
				<ModalDescription className="text-2sm leading-5 text-market-close-muted">
					{t`Review the order before it is sent to the exchange.`}
				</ModalDescription>
			</ModalHeader>

			<ModalContent className="flex flex-col gap-3 px-4 pt-4 pb-0 min-[1001px]:gap-4 min-[1001px]:px-6">
				<dl
					data-testid="order-confirmation-rows"
					className="flex max-h-[46dvh] flex-col gap-2.5 overflow-y-auto text-2sm"
				>
					{rows.map((row) => (
						<div key={row.key} className="flex items-center justify-between gap-4">
							<dt className="text-market-close-muted">{row.label}</dt>
							<dd className={cn("min-w-0 truncate text-right font-semibold tabular-nums", getToneClass(row.tone))}>
								{row.value}
							</dd>
						</div>
					))}
				</dl>

				<Checkbox
					data-testid="order-confirmation-preference"
					size="md"
					checked={dontShowAgain}
					onCheckedChange={onDontShowAgainChange}
					disabled={isSubmitting}
					className="w-fit shrink-0 items-center gap-2"
					controlClassName="size-5 !rounded-[5px] border-market-close-stroke-control bg-modal transition-all duration-[120ms] focus-visible:border-market-close-focus focus-visible:outline-none data-checked:border-market-close-control data-checked:bg-market-close-control"
					indicatorClassName="text-market-close-on-control [&>svg]:size-3"
					labelClassName="whitespace-nowrap text-2sm font-normal text-market-close-muted"
					label={t`Don't show this confirmation again`}
				/>
			</ModalContent>

			<ModalFooter className="flex-col items-stretch gap-2 px-4 pt-4 pb-4 min-[1001px]:flex-row min-[1001px]:px-6 min-[1001px]:pb-6">
				<Button
					variant="outline"
					intent="neutral"
					size="lg"
					disabled={isSubmitting}
					onClick={() => onOpenChange(false)}
					className="min-h-11 w-full rounded-[10px] border-market-close-stroke-input text-2sm font-bold text-market-close-fg hover:not-data-disabled:border-market-close-control min-[1001px]:min-h-10"
				>
					{t`Cancel`}
				</Button>
				<TradingActionButton
					onClick={onConfirm}
					disabled={isSubmitting}
					intent={getTradingCtaIntent(draft.side)}
					size="lg"
					containerClassName="w-full items-stretch"
					className={cn(
						"min-h-11 w-full rounded-[10px] text-2sm font-bold whitespace-nowrap shadow-none min-[1001px]:min-h-10",
						getTradingCtaClass(draft.side),
					)}
				>
					{isSubmitting ? (
						<>
							<SpinnerGapIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
							{t`Submitting...`}
						</>
					) : (
						draft.sideLabel
					)}
				</TradingActionButton>
			</ModalFooter>
		</AdaptiveModal>
	);
}

function getToneClass(tone: OrderConfirmationTone | undefined): string {
	if (tone === "up") return "text-market-close-success";
	if (tone === "down") return "text-market-close-danger";
	return "text-market-close-fg";
}
