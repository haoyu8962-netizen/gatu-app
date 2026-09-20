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
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans, useLingui as useLinguiMacro } from "@lingui/react/macro";
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
	useHyperliquid,
	writePersistTradingConnection,
} from "@/lib/hyperliquid";

interface Props {
	onClose: () => void;
	onConnected: () => void;
}

const previousAttemptMessage = msg`A previous connection attempt is still being reconciled. Retrying checks the same trading key and does not request another signature.`;
const missingConnectionMessage = msg`Trading is not connected in this browser. Reconnect to create or replace its trading key.`;
const ambiguousCompletionMessage = msg`The connection could not be completed. It may already be approved; wait a moment and try again.`;
const resetRequiredMessage = msg`This browser no longer has the exact trading key for the pending approval. Reset the trading connection before trying again.`;
const unsafePreflightMessage = msg`The connection could not be checked safely. No wallet signature was requested; wait a moment and try again.`;
const identityChangedMessage = msg`Wallet or network changed before the connection completed. Reopen the action for the current account.`;
const otherTabMessage = msg`A trading connection is already being established in another tab. Finish or cancel it there before trying again.`;
const unsupportedCoordinationMessage = msg`This browser cannot safely coordinate the trading connection across tabs. Use a supported browser.`;
const connectionFallbackMessage = msg`Connection could not be established.`;
const resetFailureMessage = msg`Trading connection could not be reset.`;

export function EstablishConnectionModal({ onClose, onConnected }: Props) {
	const { _ } = useLingui();
	const { t } = useLinguiMacro();
	const isMobile = useIsMobile();
	const { walletIntent } = useWalletSession();
	const { clientKey, env } = useHyperliquid();
	const { register, resetConnection, canResetConnection, status, error, agentMissingReason, failurePhase } =
		useAgentRegistration();
	const currentIdentity = clientKey === "disconnected" ? null : `${env}:${clientKey.toLowerCase()}`;
	const [persistConnection, setPersistConnection] = useState(readPersistTradingConnection);
	const [isResetting, setIsResetting] = useState(false);
	const [resetError, setResetError] = useState<Error | null>(null);
	const [resetConfirmationIdentity, setResetConfirmationIdentity] = useState<string | null>(null);
	const resetConfirmationContext = canResetConnection ? currentIdentity : null;
	const [previousResetConfirmationContext, setPreviousResetConfirmationContext] = useState(resetConfirmationContext);
	if (previousResetConfirmationContext !== resetConfirmationContext) {
		setPreviousResetConfirmationContext(resetConfirmationContext);
		setResetConfirmationIdentity(null);
		setResetError(null);
	}
	const isResetConfirmationOpen =
		resetConfirmationContext !== null && resetConfirmationIdentity === resetConfirmationContext;
	const isRegistrationPending = status === "approving_agent" || status === "verifying";
	const isBusy = isRegistrationPending || isResetting;
	const missingReasonDescriptor = getMissingReasonMessage(agentMissingReason);
	const missingReasonMessage = missingReasonDescriptor ? _(missingReasonDescriptor) : null;
	const errorDescriptor = error ? getConnectionErrorMessage(error, failurePhase) : null;
	let errorMessage: string | null = null;
	if (error) {
		errorMessage = errorDescriptor
			? _(errorDescriptor)
			: formatExchangeActionError(error, _(connectionFallbackMessage));
	}
	const resetErrorMessage = resetError ? formatExchangeActionError(resetError, _(resetFailureMessage)) : null;
	let connectButtonLabel = <Trans>Establish Connection</Trans>;
	if (status === "approving_agent") {
		connectButtonLabel = walletIntent === "embedded" ? <Trans>Connecting...</Trans> : <Trans>Confirm in wallet</Trans>;
	} else if (status === "verifying") {
		connectButtonLabel = <Trans>Verifying...</Trans>;
	}

	function handleConnect() {
		if (isBusy) return;
		setResetError(null);
		void register({ approval: { applicationReview: "confirmed" }, persistConnection })
			.then(onConnected)
			.catch(() => undefined);
	}

	function handlePersistConnectionChange(checked: boolean) {
		setPersistConnection(checked);
		writePersistTradingConnection(checked);
	}

	function handleRequestResetConnection() {
		if (!resetConfirmationContext) return;
		setResetError(null);
		setResetConfirmationIdentity(resetConfirmationContext);
	}

	async function handleResetConnection() {
		if (isBusy || !isResetConfirmationOpen) return;
		setIsResetting(true);
		setResetError(null);
		try {
			await resetConnection();
			setResetConfirmationIdentity(null);
		} catch (resetFailure) {
			setResetError(resetFailure instanceof Error ? resetFailure : new Error("Trading connection reset failed"));
		} finally {
			setIsResetting(false);
		}
	}

	function handleOpenChange(open: boolean) {
		if (open || isResetting) return;
		if (isResetConfirmationOpen) {
			setResetConfirmationIdentity(null);
			return;
		}
		onClose();
	}

	return (
		<AdaptiveModal
			open
			onOpenChange={handleOpenChange}
			size="lg"
			closeLabel={t`Close`}
			dismissible={!isResetting}
			showHandle={false}
			presentation={isMobile ? "drawer" : "modal"}
			layer="blocking"
			overlayClassName="backdrop-blur-[2px] duration-100"
			className="max-h-[calc(100dvh-1rem)] !shadow-none min-[1001px]:max-w-[32.5rem]"
		>
			<ModalHeader divider={false} className="px-6 pt-5 pb-2">
				<ModalTitle className="text-xl font-normal leading-7">
					{isResetConfirmationOpen ? <Trans>Reset trading connection</Trans> : <Trans>Establish Connection</Trans>}
				</ModalTitle>
				{isResetConfirmationOpen ? (
					<ModalDescription className="text-sm leading-5 text-fg-muted">
						<Trans>
							Resetting removes the pending trading key from this browser. If it was already approved, you will need to
							sign again to reconnect.
						</Trans>
					</ModalDescription>
				) : null}
			</ModalHeader>

			{isResetConfirmationOpen && resetErrorMessage ? (
				<ModalContent className="px-6 pt-0 pb-4">
					<p role="alert" className="text-xs leading-4 text-error">
						{resetErrorMessage}
					</p>
				</ModalContent>
			) : null}
			{isResetConfirmationOpen ? null : (
				<ModalContent className="space-y-4 px-6 pt-0 pb-4">
					<p className="text-sm leading-5 text-fg-muted">
						<Trans>
							This gas-free signature creates a dedicated API wallet for fast trading. It cannot withdraw funds.
						</Trans>
					</p>
					<Checkbox
						size="lg"
						checked={persistConnection}
						disabled={isBusy}
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
					{(resetErrorMessage ?? errorMessage) ? (
						<p role="alert" className="text-xs leading-4 text-error">
							{resetErrorMessage ?? errorMessage}
						</p>
					) : null}
				</ModalContent>
			)}

			<ModalFooter className="flex-col gap-2 px-6 pt-0 pb-5">
				{isResetConfirmationOpen ? (
					<>
						<Button
							type="button"
							variant="outline"
							intent="neutral"
							size="md"
							className="h-10 w-full"
							disabled={isBusy}
							onClick={() => setResetConfirmationIdentity(null)}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							type="button"
							intent="error"
							size="md"
							className="h-10 w-full"
							disabled={isBusy}
							onClick={() => void handleResetConnection()}
						>
							{isResetting ? <SpinnerGapIcon className="size-4 animate-spin" /> : null}
							<Trans>Reset trading connection</Trans>
						</Button>
					</>
				) : null}
				{!isResetConfirmationOpen && resetConfirmationContext ? (
					<Button
						type="button"
						variant="outline"
						intent="error"
						size="md"
						className="h-10 w-full"
						disabled={isBusy}
						onClick={handleRequestResetConnection}
					>
						{isResetting ? <SpinnerGapIcon className="size-4 animate-spin" /> : null}
						<Trans>Reset trading connection</Trans>
					</Button>
				) : null}
				{isResetConfirmationOpen ? null : (
					<Button type="button" size="md" className="h-10 w-full" disabled={isBusy} onClick={handleConnect}>
						{isRegistrationPending ? <SpinnerGapIcon className="size-4 animate-spin" /> : null}
						{connectButtonLabel}
					</Button>
				)}
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
	if (error.name === "AgentRegistrationResetRequiredError") {
		return resetRequiredMessage;
	}
	if (error.message.startsWith("A trading connection is already being established in another tab")) {
		return otherTabMessage;
	}
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
