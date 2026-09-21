import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { FUNDS_OUTCOME_TOAST_DURATION_MS } from "@/config/time";
import { useCctpDepositTracking } from "@/hooks/trade/use-cctp-deposit-tracking";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatTransferError } from "@/lib/errors/format";
import { isDefinitiveDepositSourceFailure } from "@/lib/hyperliquid/deposit-source-error";
import { useDepositModalOpen } from "@/stores/use-global-modal-store";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { DepositExplorerLink } from "./deposit-explorer-link";

interface ActiveToast {
	id: string;
	terminal: boolean;
}

function getCctpDepositToastId(sourceHash: string): string {
	return `cctp-deposit:${sourceHash.toLowerCase()}`;
}

export function CctpDepositTrackingNotifier() {
	const { t } = useLingui();
	const isTestnet = useIsTestnet();
	const depositModalOpen = useDepositModalOpen();
	const { walletAddress, embeddedWalletAddress, walletIntent } = useWalletSession();
	const isEmbeddedOwner = walletIntent === "embedded";
	const owner = isEmbeddedOwner ? embeddedWalletAddress : walletAddress;
	const tracking = useCctpDepositTracking({
		enabled: !!owner,
		env: isTestnet ? "Testnet" : "Mainnet",
		owner,
		poll: !isEmbeddedOwner && !depositModalOpen,
		removeOnForwardSubmitted: !isEmbeddedOwner && !depositModalOpen,
	});
	const activeToastRef = useRef<ActiveToast | null>(null);
	const sourceHash = tracking.recoveryRecord?.sourceHash ?? tracking.trackedSourceHash;
	const toastId = sourceHash ? getCctpDepositToastId(sourceHash) : null;
	const forwardSubmitted = tracking.data?.status === "forward-submitted";
	const definitiveFailure = isDefinitiveDepositSourceFailure(tracking.error) ? tracking.error : null;
	const statusUnavailable = tracking.isError && !definitiveFailure;
	const txChain = isTestnet ? arbitrumSepolia : arbitrum;

	useEffect(() => {
		const active = activeToastRef.current;
		const shouldShow = toastId !== null && !depositModalOpen;
		if (active && !active.terminal && (!shouldShow || active.id !== toastId)) toast.dismiss(active.id);
		if (!shouldShow) {
			activeToastRef.current = null;
			return;
		}
		if (active?.id === toastId && active.terminal) return;

		const explorerLink = <DepositExplorerLink txHash={sourceHash} txChain={txChain} label={t`View on explorer`} />;
		if (definitiveFailure) {
			toast.error(t`Deposit failed`, {
				id: toastId,
				description: (
					<span className="flex flex-col gap-1">
						<span>{formatTransferError(definitiveFailure)}</span>
						{explorerLink}
					</span>
				),
				duration: Number.POSITIVE_INFINITY,
				closeButton: true,
			});
			activeToastRef.current = { id: toastId, terminal: true };
			return;
		}
		if (forwardSubmitted) {
			toast.success(t`Forward transaction submitted`, {
				id: toastId,
				description: (
					<span className="flex flex-col gap-1">
						<span>
							{t`Circle submitted the HyperEVM forwarding transaction. HyperCore credit may take additional time.`}
						</span>
						{explorerLink}
					</span>
				),
				duration: FUNDS_OUTCOME_TOAST_DURATION_MS,
			});
			activeToastRef.current = { id: toastId, terminal: true };
			return;
		}
		toast.loading(t`Forwarding deposit`, {
			id: toastId,
			description: (
				<span className="flex flex-col gap-1">
					<span>
						{statusUnavailable
							? t`The Arbitrum transaction was submitted, but Circle status is temporarily unavailable. Tracking will resume when you return.`
							: t`Circle is minting and forwarding USDC to Hyperliquid. Do not resubmit the same transfer.`}
					</span>
					{explorerLink}
				</span>
			),
			duration: Number.POSITIVE_INFINITY,
		});
		activeToastRef.current = { id: toastId, terminal: false };
	}, [definitiveFailure, depositModalOpen, forwardSubmitted, sourceHash, statusUnavailable, t, toastId, txChain]);

	return null;
}
