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
import { useDisconnectWallet } from "@/hooks/wallet/use-wallet-session";
import { LegalStatusMessage } from "./legal-status-message";

interface Props {
	state: Exclude<LegalGateState, "inactive" | "checking" | "accepted">;
	acceptanceError: Error | null;
	onAccept: () => Promise<unknown>;
	onRetryStatus: () => Promise<unknown>;
	onResetAcceptance: () => void;
}

const LINK_CLASS = "text-brand no-underline hover:text-brand/80";

export function LegalAcceptanceModal({ state, acceptanceError, onAccept, onRetryStatus, onResetAcceptance }: Props) {
	const isMobile = useIsMobile();
	const { disconnectWallet, isDisconnecting } = useDisconnectWallet();
	const [acceptedPolicies, setAcceptedPolicies] = useState(false);
	const [acceptedCookies, setAcceptedCookies] = useState(false);
	const canAccept = acceptedPolicies && acceptedCookies && state !== "submitting";

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
	if (state === "blocked") {
		content = (
			<LegalStatusMessage
				title={<Trans>Access restricted</Trans>}
				description={<Trans>This account is not currently permitted to perform trading actions on Hyperliquid.</Trans>}
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
		content = (
			<>
				<ModalHeader divider={false} className="px-6 pt-5 pb-2">
					<ModalTitle className="text-xl font-normal leading-7">
						<Trans>Terms of Use, Privacy Policy, and Cookie Policy</Trans>
					</ModalTitle>
				</ModalHeader>

				<ModalContent className="space-y-4 px-6 pt-0 pb-4">
					<ModalDescription className="text-sm leading-5 text-fg-muted">
						<Trans>To proceed, review and accept the following:</Trans>
					</ModalDescription>

					<Checkbox
						size="lg"
						checked={acceptedPolicies}
						disabled={state === "submitting"}
						onCheckedChange={setAcceptedPolicies}
						label={
							<span className="text-sm leading-5 text-fg-muted">
								<Trans>
									I have read and agree to the Gatu{" "}
									<Link to="/terms" target="_blank" className={LINK_CLASS}>
										Terms of Use
									</Link>
									,{" "}
									<Link to="/privacy" target="_blank" className={LINK_CLASS}>
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
							</span>
						}
					/>

					<Checkbox
						size="lg"
						checked={acceptedCookies}
						disabled={state === "submitting"}
						onCheckedChange={setAcceptedCookies}
						label={
							<span className="text-sm leading-5 text-fg-muted">
								<Trans>
									I understand that Gatu uses essential cookies and browser storage for authentication, security,
									preferences, and trading functionality. Review the{" "}
									<Link to="/cookies" target="_blank" className={LINK_CLASS}>
										Cookie Policy
									</Link>
									.
								</Trans>
							</span>
						}
					/>

					{acceptanceError && (
						<p role="alert" className="text-xs leading-4 text-error">
							<Trans>The terms could not be accepted. Confirm the request in the selected wallet and try again.</Trans>
						</p>
					)}
				</ModalContent>

				<ModalFooter className="grid grid-cols-1 gap-2 px-6 pt-0 pb-5 min-[1000px]:grid-cols-2">
					<Button
						type="button"
						variant="outline"
						size="md"
						disabled={isDisconnecting || state === "submitting"}
						onClick={handleDecline}
					>
						<Trans>Decline</Trans>
					</Button>
					<Button type="button" size="md" disabled={!canAccept} onClick={handleAccept}>
						{state === "submitting" ? <Trans>Confirm in wallet</Trans> : <Trans>Accept</Trans>}
					</Button>
				</ModalFooter>
			</>
		);
	}

	return (
		<AdaptiveModal
			open
			onOpenChange={() => undefined}
			size="lg"
			showClose={false}
			dismissible={false}
			presentation={isMobile ? "drawer" : "modal"}
			layer="blocking"
			overlayClassName="backdrop-blur-[2px] duration-100"
			className="max-h-[calc(100dvh-1rem)] rounded-t-16 !shadow-none min-[1000px]:max-w-[32.5rem] min-[1000px]:rounded-16"
		>
			{content}
		</AdaptiveModal>
	);
}
