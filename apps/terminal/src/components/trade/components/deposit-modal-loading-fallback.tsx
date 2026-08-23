import { ModalContent, ModalHeader, ModalTitle } from "@gatu/ui";
import { Trans } from "@lingui/react/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDepositModalActions, useDepositModalTab } from "@/stores/use-global-modal-store";
import { PendingActionModal } from "./pending-action-modal";

export function DepositModalLoadingFallback() {
	const activeTab = useDepositModalTab();
	const { close } = useDepositModalActions();
	const isMobile = useIsMobile();
	const usesFundsRedesign = activeTab !== "bridge";

	function handleOpenChange(open: boolean) {
		if (!open) close();
	}

	return (
		<PendingActionModal
			open
			onOpenChange={handleOpenChange}
			isPending={false}
			presentation={isMobile ? "drawer" : "modal"}
			handleClassName={usesFundsRedesign ? "top-2.5 !rounded-[2px] bg-market-close-stroke-input" : undefined}
			overlayClassName={usesFundsRedesign ? "!bg-scrim/60 !backdrop-blur-none" : undefined}
			className={
				usesFundsRedesign
					? "font-market-close !border-0 !bg-modal !shadow-none max-[1000px]:!rounded-t-[20px] [&>button]:!top-5 [&>button]:!right-4 [&>button]:!rounded-[8px] [&>button]:text-market-close-muted [&>button:hover]:bg-market-close-hover [&>button:hover]:text-market-close-fg [&>button:active]:bg-market-close-hover min-[1001px]:!max-w-[28rem] min-[1001px]:!rounded-[16px] min-[1001px]:!shadow-overlay min-[1001px]:[&>button]:!top-6 min-[1001px]:[&>button]:!right-6 min-[1001px]:[&>button>svg]:size-[18px]"
					: undefined
			}
		>
			<ModalHeader
				divider={!usesFundsRedesign}
				className={
					usesFundsRedesign
						? "px-4 pt-7 pr-14 pb-0 text-left min-[1001px]:px-6 min-[1001px]:pr-14 min-[1001px]:pt-6"
						: undefined
				}
			>
				<ModalTitle
					className={
						usesFundsRedesign
							? activeTab === "deposit"
								? "sr-only"
								: "text-base leading-[22px] font-bold text-market-close-fg min-[1001px]:text-[17px] min-[1001px]:leading-6"
							: undefined
					}
				>
					{activeTab === "deposit" ? (
						<Trans>Deposit</Trans>
					) : activeTab === "withdraw" ? (
						<Trans>Withdraw</Trans>
					) : (
						<Trans>Bridge</Trans>
					)}
				</ModalTitle>
			</ModalHeader>

			<ModalContent
				className={
					usesFundsRedesign ? "px-4 pt-3.5 pb-5 min-[1001px]:px-6 min-[1001px]:pt-3.5 min-[1001px]:pb-6" : "space-y-4"
				}
			>
				<output
					className={
						activeTab === "deposit" ? "block min-[1001px]:h-[37.5rem]" : "flex min-h-72 items-center justify-center"
					}
					data-deposit-loading-layout={activeTab === "deposit" ? "funding-address" : undefined}
					data-desktop-content-height={activeTab === "deposit" ? "37.5rem" : undefined}
					data-testid="deposit-modal-loading-fallback"
					aria-busy="true"
				>
					<span className="sr-only">
						<Trans>Loading...</Trans>
					</span>
					{activeTab === "deposit" ? (
						<div className="flex h-full flex-col gap-3.5" aria-hidden="true">
							<div className="space-y-1.5" data-skeleton-slot="selector">
								<div className="flex items-center justify-between gap-3">
									<span className="h-2.5 w-12 rounded-full bg-market-close-stroke-input/50" />
									<span className="h-2.5 w-24 rounded-full bg-market-close-stroke-input/40" />
								</div>
								<div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
									<span className="h-11 rounded-[10px] border border-market-close-stroke-card bg-market-close-card" />
									<span className="size-1 rounded-full bg-market-close-stroke-input" />
									<span className="h-11 rounded-[10px] border border-market-close-stroke-card bg-market-close-card" />
								</div>
							</div>

							<div
								className="mx-auto flex size-[140px] shrink-0 items-center justify-center rounded-[12px] border border-market-close-stroke-card bg-market-close-card"
								data-skeleton-slot="qr"
							>
								<span className="size-[108px] rounded-[8px] bg-market-close-stroke-input/30" />
							</div>

							<div className="space-y-1.5" data-skeleton-slot="address">
								<span className="block h-2.5 w-20 rounded-full bg-market-close-stroke-input/50" />
								<div className="flex h-12 items-center rounded-[10px] border border-market-close-stroke-card bg-market-close-card px-3">
									<span className="mx-auto h-2.5 w-4/5 rounded-full bg-market-close-stroke-input/40" />
								</div>
							</div>

							<div
								className="space-y-2 rounded-[10px] border border-market-close-stroke-card bg-market-close-card px-3.5 py-3"
								data-skeleton-slot="information"
							>
								{["receive", "fee", "time"].map((row) => (
									<div className="flex items-center justify-between gap-3" key={row}>
										<span className="h-2.5 w-16 rounded-full bg-market-close-stroke-input/50" />
										<span className="h-2.5 w-28 rounded-full bg-market-close-stroke-input/40" />
									</div>
								))}
							</div>

							<div
								className="h-14 rounded-[10px] border border-market-close-stroke-card bg-market-close-card"
								data-skeleton-slot="notice"
							/>

							<div
								className="mt-auto h-11 rounded-[12px] bg-market-close-stroke-input/70"
								data-skeleton-slot="action"
							/>
						</div>
					) : (
						<SpinnerGapIcon className="size-5 animate-spin text-signal motion-reduce:animate-none" aria-hidden="true" />
					)}
				</output>
			</ModalContent>
		</PendingActionModal>
	);
}
