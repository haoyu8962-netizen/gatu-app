import { useLingui } from "@lingui/react/macro";
import { memo, Suspense, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDepositModalActions, useDepositModalOpen, useDepositModalTab } from "@/stores/use-global-modal-store";
import { DepositModalLoadingFallback } from "./deposit-modal-loading-fallback";
import type { DepositModalSurface } from "./deposit-modal-surface";
import { renderFundsModalBackButton } from "./funds-modal-back-button";
import { FundsModalShell } from "./funds-modal-shell";
import { DepositModal } from "./lazy-global-modals";

const DepositModalBody = memo(DepositModal);

/**
 * Mounts the Deposit / Withdraw / Bridge shell once and lets only the dialog body load lazily. The
 * body runs beside the shell, reports what to show through `onSurfaceChange`, and the shell keeps
 * its DOM, backdrop and enter transition when the chunk arrives (`.claude/rules/style-ui-guide.md`,
 * Loading placeholders).
 */
export function DepositModalHost() {
	const { t } = useLingui();
	const open = useDepositModalOpen();
	const activeTab = useDepositModalTab();
	const { close } = useDepositModalActions();
	const isMobile = useIsMobile();
	const [surface, setSurface] = useState<DepositModalSurface | null>(null);
	const body = (
		<Suspense fallback={null}>
			<DepositModalBody onSurfaceChange={setSurface} />
		</Suspense>
	);

	if (surface?.kind === "status") {
		return (
			<>
				{body}
				{surface.screen}
			</>
		);
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen) close();
	}

	return (
		<>
			{body}
			<FundsModalShell
				open={open}
				onOpenChange={surface ? surface.onOpenChange : handleOpenChange}
				isPending={surface ? surface.isPending : false}
				presentation={isMobile ? "drawer" : "modal"}
				tab={surface ? surface.tab : activeTab}
				headerStart={
					surface?.backButton
						? renderFundsModalBackButton({
								disabled: surface.backButton.disabled,
								label: t`Back`,
								onClick: surface.backButton.onClick,
							})
						: null
				}
			>
				{surface ? surface.content : <DepositModalLoadingFallback />}
			</FundsModalShell>
		</>
	);
}
