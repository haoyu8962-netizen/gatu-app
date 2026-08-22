import { AdaptiveModal, Button, Checkbox, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatExchangeActionError } from "@/lib/errors/format";
import { readPersistTradingConnection, useAgentRegistration, writePersistTradingConnection } from "@/lib/hyperliquid";

interface Props {
	onClose: () => void;
	onConnected: () => void;
}

export function EstablishConnectionModal({ onClose, onConnected }: Props) {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const { register, status, error } = useAgentRegistration();
	const [persistConnection, setPersistConnection] = useState(readPersistTradingConnection);
	const isPending = status === "approving_agent" || status === "verifying";

	function handleConnect() {
		if (isPending) return;
		void register({ persistConnection })
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
					label={
						<span className="text-sm leading-5 text-fg-muted">
							<Trans>Stay Connected</Trans>
						</span>
					}
				/>
				{error ? (
					<p role="alert" className="text-xs leading-4 text-error">
						{formatExchangeActionError(error, t`Connection could not be established.`)}
					</p>
				) : null}
			</ModalContent>

			<ModalFooter className="px-6 pt-0 pb-5">
				<Button type="button" size="md" className="h-10 w-full" disabled={isPending} onClick={handleConnect}>
					{isPending ? <SpinnerGapIcon className="size-4 animate-spin" /> : null}
					{status === "approving_agent" ? (
						<Trans>Confirm in wallet</Trans>
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
