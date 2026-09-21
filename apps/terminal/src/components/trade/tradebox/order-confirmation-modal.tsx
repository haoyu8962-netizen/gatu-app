import {
	AdaptiveModal,
	Checkbox,
	ModalContent,
	ModalDescription,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from "@gatu/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import {
	buildOrderConfirmationRows,
	getOrderConfirmationSubmitLabel,
	type OrderConfirmationDraft,
	type OrderConfirmationTone,
} from "@/domain/trade/order-confirmation";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { isTwapOrderType } from "@/lib/trade/order-types";
import { getTradingCtaClass, getTradingCtaIntent } from "@/lib/ui/trading-cta";
import { TradingActionButton } from "../components/trading-action-button";

interface Props {
	open: boolean;
	draft: OrderConfirmationDraft;
	dontShowAgain: boolean;
	onDontShowAgainChange: (next: boolean) => void;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
}

export function OrderConfirmationModal({
	open,
	draft,
	dontShowAgain,
	onDontShowAgainChange,
	onConfirm,
	onOpenChange,
}: Props) {
	useNumberFormatRevision();
	const { _ } = useLingui();
	const isMobile = useIsMobile();
	const rows = buildOrderConfirmationRows(draft, _);
	const submitLabel = getOrderConfirmationSubmitLabel(draft, _);

	function handleConfirm() {
		if (!open) return;
		onConfirm();
	}

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={onOpenChange}
			presentation={isMobile ? "drawer" : "modal"}
			size="sm"
			showHandle={isMobile}
			closeLabel={_(msg`Close order confirmation`)}
			handleClassName="top-2 h-1 w-9 !rounded-[2px] bg-market-close-stroke-input"
			overlayClassName="!bg-scrim/60 !backdrop-blur-none"
			className="font-market-close max-h-[calc(100dvh-1rem)] !rounded-t-[18px] max-[1000px]:!border-0 !bg-modal !shadow-none [&>button]:!top-5 [&>button]:!right-4 [&>button]:!rounded-[8px] [&>button]:text-market-close-muted [&>button:hover]:bg-market-close-hover [&>button:hover]:text-market-close-fg [&>button:active]:bg-market-close-hover min-[1001px]:max-w-[23.75rem] min-[1001px]:!rounded-[16px] min-[1001px]:!shadow-overlay min-[1001px]:[&>button]:!top-6 min-[1001px]:[&>button]:!right-6"
		>
			<ModalHeader divider={false} className="gap-1 px-4 pt-7 pb-0 text-start min-[1001px]:px-6 min-[1001px]:pt-6">
				<ModalTitle className="text-base leading-[22px] font-bold text-market-close-fg min-[1001px]:text-[17px] min-[1001px]:leading-6">
					{_(msg`Confirm Order`)}
				</ModalTitle>
				<ModalDescription className="text-2sm leading-5 text-market-close-muted">
					{_(msg`Review the order before it is sent to the exchange.`)}
				</ModalDescription>
			</ModalHeader>

			<ModalContent className="flex flex-col gap-4 px-4 pt-5 pb-0 min-[1001px]:gap-5 min-[1001px]:px-6">
				<dl
					data-testid="order-confirmation-rows"
					className="flex max-h-[46dvh] flex-col gap-3.5 overflow-y-auto text-2sm leading-5"
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
					disabled={!open}
					className="w-fit shrink-0 items-center gap-2"
					controlClassName="size-5 !rounded-[5px] border-market-close-stroke-control bg-modal transition-all duration-[120ms] focus-visible:border-market-close-focus focus-visible:outline-none data-checked:border-market-close-control data-checked:bg-market-close-control"
					indicatorClassName="text-market-close-on-control [&>svg]:size-3"
					labelClassName="whitespace-nowrap text-2sm font-normal text-market-close-muted"
					label={_(msg`Don't show this confirmation again`)}
				/>
			</ModalContent>

			<ModalFooter className="px-4 pt-4 pb-4 min-[1001px]:px-6 min-[1001px]:pb-6">
				<TradingActionButton
					requiresBuilderFee={!isTwapOrderType(draft.orderType)}
					onClick={handleConfirm}
					disabled={!open}
					intent={getTradingCtaIntent(draft.side)}
					size="lg"
					containerClassName="w-full items-stretch"
					className={cn(
						"min-h-11 w-full rounded-[10px] text-2sm font-bold whitespace-nowrap shadow-none min-[1001px]:min-h-10",
						getTradingCtaClass(draft.side),
					)}
				>
					{submitLabel}
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
