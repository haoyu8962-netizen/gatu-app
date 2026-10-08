import { Trans } from "@lingui/react/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDepositModalActions, useDepositModalTab } from "@/stores/use-global-modal-store";
import { FundsModalShell } from "./funds-modal-shell";

export function DepositModalLoadingFallback() {
	const activeTab = useDepositModalTab();
	const { close } = useDepositModalActions();
	const isMobile = useIsMobile();

	function handleOpenChange(open: boolean) {
		if (!open) close();
	}

	return (
		<FundsModalShell
			open
			onOpenChange={handleOpenChange}
			isPending={false}
			presentation={isMobile ? "drawer" : "modal"}
			tab={activeTab}
		>
			<output
				className="flex min-h-72 items-center justify-center"
				data-testid="deposit-modal-loading-fallback"
				aria-busy="true"
			>
				<span className="sr-only">
					<Trans>Loading...</Trans>
				</span>
				<SpinnerGapIcon className="size-5 animate-spin text-fg-muted motion-reduce:animate-none" aria-hidden="true" />
			</output>
		</FundsModalShell>
	);
}
