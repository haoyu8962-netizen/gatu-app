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
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import type { LegalGateState } from "@/hooks/trade/use-legal-gate";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDisconnectWallet, useReconnectWallet } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { LegalStatusMessage } from "./legal-status-message";

interface Props {
	state: Exclude<LegalGateState, "inactive" | "checking" | "accepted">;
	acceptanceError: Error | null;
	blockedDescription?: ReactNode;
	onAccept: () => Promise<unknown>;
	onRetryStatus: () => Promise<unknown>;
	onResetAcceptance: () => void;
}

const LINK_CLASS =
	"rounded-[2px] text-market-close-fg underline decoration-market-close-stroke-control underline-offset-2 transition-colors duration-[120ms] hover:text-market-close-danger hover:decoration-market-close-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control";

const CHECKBOX_ROW_CLASS =
	"min-h-11 w-full gap-2.5 rounded-[10px] px-2 py-3 transition-colors duration-[120ms] min-[1001px]:py-2.5 min-[1001px]:pr-2.5";

const ACTION_BUTTON_CLASS =
	"h-[46px] !rounded-[10px] px-3 py-0 text-sm !shadow-none active:not-data-disabled:!scale-100";

export function LegalAcceptanceModal({
	state,
	acceptanceError,
	blockedDescription,
	onAccept,
	onRetryStatus,
	onResetAcceptance,
}: Props) {
	const isMobile = useIsMobile();
	const { disconnectWallet, isDisconnecting } = useDisconnectWallet();
	const { reconnectWallet, isReconnecting } = useReconnectWallet();
	const [acceptedPolicies, setAcceptedPolicies] = useState(false);
	const [acceptedCookies, setAcceptedCookies] = useState(false);
	const isSubmitting = state === "submitting";
	const hasAcceptedAll = acceptedPolicies && acceptedCookies;
	const canAccept = hasAcceptedAll && !isSubmitting;

	function handleAccept() {
		if (!canAccept) return;
		void onAccept().catch(() => undefined);
	}

	function handleRetry() {
		onResetAcceptance();
		void onRetryStatus();
	}

	function handleDecline() {
		void disconnectWallet();
	}

	let content: ReactNode;
	if (state === "wallet_required") {
		content = (
			<LegalStatusMessage
				title={<Trans>Reconnect wallet</Trans>}
				description={
					<Trans>Selected wallet does not match the connected account. Reconnect your wallet and try again.</Trans>
				}
				actionLabel={<Trans>Reconnect wallet</Trans>}
				actionDisabled={isReconnecting}
				onAction={() => void reconnectWallet()}
			/>
		);
	} else if (state === "blocked") {
		content = (
			<LegalStatusMessage
				title={<Trans>Access restricted</Trans>}
				description={
					blockedDescription ?? (
						<Trans>This account is not currently permitted to perform trading actions on Hyperliquid.</Trans>
					)
				}
				actionLabel={<Trans>Disconnect</Trans>}
				actionDisabled={isDisconnecting}
				onAction={handleDecline}
			/>
		);
	} else if (state === "error") {
		content = (
			<LegalStatusMessage
				title={<Trans>Unable to verify access</Trans>}
				description={
					<Trans>We could not verify the legal status for this wallet. Check your connection and try again.</Trans>
				}
				actionLabel={<Trans>Retry</Trans>}
				onAction={handleRetry}
			/>
		);
	} else {
		const acceptButton = (
			<Button
				key="accept"
				type="button"
				size="md"
				aria-busy={isSubmitting}
				disabled={!canAccept}
				onClick={handleAccept}
				className={cn(
					ACTION_BUTTON_CLASS,
					"font-bold !bg-market-close-control !text-market-close-on-control",
					isSubmitting
						? "data-disabled:!bg-legal-acceptance-pending data-disabled:!text-white"
						: "data-disabled:!bg-legal-acceptance-disabled data-disabled:!text-market-close-subtle",
				)}
			>
				<Trans>Confirm in wallet</Trans>
				{isSubmitting ? "…" : null}
			</Button>
		);
		const declineButton = (
			<Button
				key="decline"
				type="button"
				variant="outline"
				intent="neutral"
				size="md"
				disabled={isDisconnecting || isSubmitting}
				onClick={handleDecline}
				className={cn(
					ACTION_BUTTON_CLASS,
					"font-semibold !border-transparent !bg-transparent !text-market-close-muted min-[1001px]:!border-market-close-stroke-input min-[1001px]:!text-market-close-fg min-[1001px]:hover:!border-market-close-control min-[1001px]:hover:!bg-market-close-card",
				)}
			>
				<Trans>Decline</Trans>
			</Button>
		);

		content = (
			<div
				data-slot="legal-acceptance-content"
				className="flex flex-col gap-3.5 px-4 pt-2 pb-4 text-market-close-fg min-[1001px]:gap-[18px] min-[1001px]:p-6"
			>
				<div
					data-slot="legal-acceptance-drawer-handle"
					className="mx-auto h-1 w-9 shrink-0 rounded-[2px] bg-market-close-stroke-input min-[1001px]:hidden"
					aria-hidden="true"
				/>

				<ModalHeader divider={false} className="gap-[5px] p-0 min-[1001px]:gap-1.5">
					<ModalTitle className="text-[17px] leading-[1.35] font-bold text-market-close-fg text-pretty">
						<Trans>Terms of Use, Privacy Policy, and Cookie Policy</Trans>
					</ModalTitle>
					<ModalDescription className="text-[13px] leading-[1.6] text-market-close-muted">
						<Trans>To proceed, review and accept the following:</Trans>
					</ModalDescription>
				</ModalHeader>

				<ModalContent className="p-0">
					<div className="flex flex-col gap-0.5">
						<Checkbox
							size="sm"
							checked={acceptedPolicies}
							disabled={isSubmitting}
							onCheckedChange={setAcceptedPolicies}
							className={cn(
								CHECKBOX_ROW_CLASS,
								isSubmitting ? "cursor-default opacity-100" : "hover:bg-market-close-card",
							)}
							controlClassName="mt-0.5 size-[17px] rounded-[5px] border-market-close-stroke-control bg-modal data-checked:border-market-close-control data-checked:bg-market-close-control"
							indicatorClassName="text-market-close-on-control"
							labelClassName="text-[13px] leading-[1.65] text-market-close-fg text-pretty"
							label={
								<Trans>
									I have read and agree to the Gatu{" "}
									<Link to="/terms" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
										Terms of Use
									</Link>
									,{" "}
									<Link to="/privacy" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
										Privacy Policy
									</Link>
									, and the{" "}
									<a
										href="https://app.hyperliquid.xyz/terms"
										target="_blank"
										rel="noopener noreferrer"
										className={LINK_CLASS}
									>
										Hyperliquid Terms of Use
									</a>
									.
								</Trans>
							}
						/>

						<Checkbox
							size="sm"
							checked={acceptedCookies}
							disabled={isSubmitting}
							onCheckedChange={setAcceptedCookies}
							className={cn(
								CHECKBOX_ROW_CLASS,
								isSubmitting ? "cursor-default opacity-100" : "hover:bg-market-close-card",
							)}
							controlClassName="mt-0.5 size-[17px] rounded-[5px] border-market-close-stroke-control bg-modal data-checked:border-market-close-control data-checked:bg-market-close-control"
							indicatorClassName="text-market-close-on-control"
							labelClassName="text-[13px] leading-[1.65] text-market-close-fg text-pretty"
							label={
								<Trans>
									I understand that Gatu uses essential cookies and browser storage for authentication, security,
									preferences, and trading functionality. Review the{" "}
									<Link to="/cookies" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
										Cookie Policy
									</Link>
									.
								</Trans>
							}
						/>
					</div>

					{acceptanceError && (
						<p role="alert" className="mt-2 text-xs leading-[1.6] text-market-close-danger">
							<Trans>The terms could not be accepted. Confirm the request in the selected wallet and try again.</Trans>
						</p>
					)}
				</ModalContent>

				<ModalFooter className="grid grid-cols-1 gap-2 p-0 min-[1001px]:grid-cols-2 min-[1001px]:gap-2.5">
					{isMobile ? [acceptButton, declineButton] : [declineButton, acceptButton]}
					<p
						aria-live="polite"
						className={cn(
							"text-center text-xs leading-[1.6] min-[1001px]:col-span-2",
							isSubmitting
								? "text-market-close-fg"
								: hasAcceptedAll
									? "text-market-close-muted"
									: "text-market-close-subtle",
						)}
					>
						{isSubmitting ? (
							<Trans>Confirm the gas-free request in your selected wallet.</Trans>
						) : hasAcceptedAll ? (
							<Trans>This signature is gas-free.</Trans>
						) : (
							<Trans>Select both items to continue.</Trans>
						)}
					</p>
				</ModalFooter>

				<p className="border-t border-trading-panel-stroke-row pt-3 text-[11px] leading-[1.6] text-market-close-subtle max-[1000px]:border-0 max-[1000px]:pt-0 max-[1000px]:text-center">
					<Trans>Terms acceptance is linked to the selected wallet.</Trans>
				</p>
			</div>
		);
	}

	return (
		<AdaptiveModal
			open
			onOpenChange={() => undefined}
			size="lg"
			showClose={false}
			showHandle={false}
			dismissible={false}
			presentation={isMobile ? "drawer" : "modal"}
			layer="blocking"
			overlayClassName="!bg-trading-panel-scrim !backdrop-blur-none duration-100"
			className="max-h-[calc(100dvh-1rem)] !rounded-t-[18px] !border-0 !shadow-none font-market-close min-[1001px]:!max-w-[30rem] min-[1001px]:!rounded-[16px] min-[1001px]:!border min-[1001px]:!border-market-close-stroke-card min-[1001px]:!shadow-legal-acceptance"
		>
			{content}
		</AdaptiveModal>
	);
}
