import { AdaptiveModal, Button, Checkbox, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@gatu/ui";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatExchangeActionError } from "@/lib/errors/format";
import {
	type AgentMissingReason,
	type AgentRegistrationFailurePhase,
	readPersistTradingConnection,
	useAgentRegistration,
	writePersistTradingConnection,
} from "@/lib/hyperliquid";

interface Props {
	onClose: () => void;
	onConnected: () => void;
}

const previousAttemptMessage = msg`A previous connection attempt is still being reconciled. Retrying checks the same trading key and does not request another signature.`;
const missingConnectionMessage = msg`Trading is not connected in this browser. Reconnect to create or replace its trading key.`;
const ambiguousCompletionMessage = msg`The connection could not be completed. It may already be approved; wait a moment and try again.`;
const unsafePreflightMessage = msg`The connection could not be checked safely. No wallet signature was requested; wait a moment and try again.`;
const identityChangedMessage = msg`Wallet or network changed before the connection completed. Reopen the action for the current account.`;
const otherTabMessage = msg`A trading connection is already being established in another tab. Finish or cancel it there before trying again.`;
const unsupportedCoordinationMessage = msg`This browser cannot safely coordinate the trading connection across tabs. Use a supported browser.`;
const connectionFallbackMessage = msg`Connection could not be established.`;

export function EstablishConnectionModal({ onClose, onConnected }: Props) {
	const { _ } = useLingui();
	const isMobile = useIsMobile();
	const { walletIntent } = useWalletSession();
	const { register, status, error, agentMissingReason, failurePhase } = useAgentRegistration();
	const [persistConnection, setPersistConnection] = useState(readPersistTradingConnection);
	const isPending = status === "approving_agent" || status === "verifying";
	const missingReasonDescriptor = getMissingReasonMessage(agentMissingReason);
	const missingReasonMessage = missingReasonDescriptor ? _(missingReasonDescriptor) : null;
	const errorDescriptor = error ? getConnectionErrorMessage(error, failurePhase) : null;
	const errorMessage = error
		? errorDescriptor
			? _(errorDescriptor)
			: formatExchangeActionError(error, _(connectionFallbackMessage))
		: null;

	function handleConnect() {
		if (isPending) return;
		void register({ approval: { applicationReview: "confirmed" }, persistConnection })
			.then(onConnected)
			.catch(() => undefined);
	}

	function handlePersistConnectionChange(checked: boolean) {
		setPersistConnection(checked);
		writePersistTradingConnection(checked);
	}

	return (
		<AdaptiveModal
			open
			onOpenChange={(open) => !open && onClose()}
			size="lg"
			showHandle={false}
			presentation={isMobile ? "drawer" : "modal"}
			layer="blocking"
			overlayClassName="backdrop-blur-[2px] duration-100"
			className="max-h-[calc(100dvh-1rem)] rounded-t-16 !shadow-none min-[1001px]:max-w-[32.5rem] min-[1001px]:rounded-16"
		>
			<ModalHeader divider={false} className="px-6 pt-5 pb-2">
				<ModalTitle className="text-xl font-normal leading-7">
					<Trans>Establish Connection</Trans>
				</ModalTitle>
			</ModalHeader>

			<ModalContent className="space-y-4 px-6 pt-0 pb-4">
				<p className="text-sm leading-5 text-fg-muted">
					<Trans>
						This gas-free signature creates a dedicated API wallet for fast trading. It cannot withdraw funds.
					</Trans>
				</p>
				<Checkbox
					size="lg"
					checked={persistConnection}
					disabled={isPending}
					onCheckedChange={handlePersistConnectionChange}
					description={
						<Trans>Stored only in this browser profile; other browsers and devices stay disconnected.</Trans>
					}
					label={
						<span className="text-sm leading-5 text-fg-muted">
							<Trans>Stay Connected</Trans>
						</span>
					}
				/>
				{missingReasonMessage ? (
					<output className="block rounded-8 bg-warning-soft px-3 py-2 text-xs leading-5 text-warning">
						{missingReasonMessage}
					</output>
				) : null}
				{errorMessage ? (
					<p role="alert" className="text-xs leading-4 text-error">
						{errorMessage}
					</p>
				) : null}
			</ModalContent>

			<ModalFooter className="px-6 pt-0 pb-5">
				<Button type="button" size="md" className="h-10 w-full" disabled={isPending} onClick={handleConnect}>
					{isPending ? <SpinnerGapIcon className="size-4 animate-spin" /> : null}
					{status === "approving_agent" ? (
						walletIntent === "embedded" ? (
							<Trans>Connecting...</Trans>
						) : (
							<Trans>Confirm in wallet</Trans>
						)
					) : status === "verifying" ? (
						<Trans>Verifying...</Trans>
					) : (
						<Trans>Establish Connection</Trans>
					)}
				</Button>
			</ModalFooter>
		</AdaptiveModal>
	);
}

function getMissingReasonMessage(reason: AgentMissingReason | null): MessageDescriptor | null {
	if (!reason) return null;
	if (reason === "approval_unconfirmed") {
		return previousAttemptMessage;
	}
	return missingConnectionMessage;
}

function getConnectionErrorMessage(
	error: Error,
	failurePhase: AgentRegistrationFailurePhase | null,
): MessageDescriptor | null {
	if (failurePhase === "verification" || failurePhase === "persistence") {
		return ambiguousCompletionMessage;
	}

	if (error.name !== "AgentStatusError") {
		if (
			failurePhase === "preflight" &&
			(error.message === "Agent key storage could not be verified" ||
				error.message === "Stored Agent key is invalid" ||
				error.message === "Agent private key could not be stored securely")
		) {
			return unsafePreflightMessage;
		}
		if (error.message.startsWith("Wallet or network changed")) {
			return identityChangedMessage;
		}
		if (error.message.startsWith("A trading connection is already being established in another tab")) {
			return otherTabMessage;
		}
		if (error.message.startsWith("Secure Agent registration requires Web Locks support")) {
			return unsupportedCoordinationMessage;
		}
		return null;
	}

	if (failurePhase === "preflight" && error.name === "AgentStatusError") {
		return unsafePreflightMessage;
	}

	return null;
}
