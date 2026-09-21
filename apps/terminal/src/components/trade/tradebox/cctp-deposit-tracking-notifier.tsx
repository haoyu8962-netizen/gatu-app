import { useLingui } from "@lingui/react/macro";
import { useEffect, useLayoutEffect, useRef } from "react";
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

interface DepositNotification {
	presentationId: string;
	sourceHash: string;
	phase: "forwarding" | "success" | "failed";
	error: Error | null;
	statusUnavailable: boolean;
	locale: string;
	dismissed: boolean;
}

let presentationSequence = 0;

export function CctpDepositTrackingNotifier() {
	const { t, i18n } = useLingui();
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
	const notificationsRef = useRef(new Map<string, DepositNotification>());
	const identity = `${isTestnet ? "Testnet" : "Mainnet"}:${owner?.toLowerCase() ?? "disconnected"}`;
	const sourceHash = tracking.recoveryRecord?.sourceHash ?? tracking.trackedSourceHash;
	const notificationKey = sourceHash && owner ? `cctp-deposit:${identity}:${sourceHash.toLowerCase()}` : null;
	const forwardSubmitted = tracking.data?.status === "forward-submitted";
	const definitiveFailure = isDefinitiveDepositSourceFailure(tracking.error) ? tracking.error : null;
	const statusUnavailable = tracking.isError && !definitiveFailure;
	const txChain = isTestnet ? arbitrumSepolia : arbitrum;

	useLayoutEffect(() => {
		const notifications = notificationsRef.current;
		const prefix = `cctp-deposit:${identity}:`;
		return () => {
			for (const [id, notification] of notifications) {
				if (!id.startsWith(prefix)) continue;
				toast.dismiss(notification.presentationId);
				notifications.delete(id);
			}
		};
	}, [identity]);

	useEffect(() => {
		const notifications = notificationsRef.current;
		for (const [id, notification] of notifications) {
			if (notification.phase === "forwarding" && (depositModalOpen || id !== notificationKey)) {
				toast.dismiss(notification.presentationId);
				notifications.delete(id);
			}
		}
		if (notificationKey && sourceHash && !depositModalOpen) {
			const previous = notifications.get(notificationKey);
			let phase: DepositNotification["phase"] = "forwarding";
			if (definitiveFailure) {
				phase = "failed";
			} else if (forwardSubmitted) {
				phase = "success";
			}
			if (!previous || previous.phase === "forwarding") {
				if (
					!previous ||
					previous.phase !== phase ||
					previous.error !== definitiveFailure ||
					previous.statusUnavailable !== statusUnavailable
				) {
					const presentationId = previous?.dismissed ? undefined : previous?.presentationId;
					notifications.set(notificationKey, {
						presentationId: presentationId ?? `${notificationKey}:presentation:${++presentationSequence}`,
						sourceHash,
						phase,
						error: definitiveFailure,
						statusUnavailable,
						locale: "",
						dismissed: false,
					});
				}
			}
		}

		for (const notification of notifications.values()) {
			if (notification.dismissed || notification.locale === i18n.locale) continue;
			notification.locale = i18n.locale;
			const explorerLink = (
				<DepositExplorerLink txHash={notification.sourceHash} txChain={txChain} label={t`View on explorer`} />
			);
			const onDismiss = () => {
				notification.dismissed = true;
			};
			const lifecycle = { id: notification.presentationId, onDismiss, onAutoClose: onDismiss };
			if (notification.phase === "failed") {
				toast.error(t`Deposit failed`, {
					...lifecycle,
					description: (
						<span className="flex flex-col gap-1">
							<span>{formatTransferError(notification.error)}</span>
							{explorerLink}
						</span>
					),
					duration: Number.POSITIVE_INFINITY,
					closeButton: true,
				});
			} else if (notification.phase === "success") {
				toast.success(t`Forward transaction submitted`, {
					...lifecycle,
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
			} else {
				toast.loading(t`Forwarding deposit`, {
					...lifecycle,
					description: (
						<span className="flex flex-col gap-1">
							<span>
								{notification.statusUnavailable
									? t`The Arbitrum transaction was submitted, but Circle status is temporarily unavailable. Tracking will resume when you return.`
									: t`Circle is minting and forwarding USDC to Hyperliquid. Do not resubmit the same transfer.`}
							</span>
							{explorerLink}
						</span>
					),
					duration: Number.POSITIVE_INFINITY,
				});
			}
		}
	}, [
		definitiveFailure,
		depositModalOpen,
		forwardSubmitted,
		i18n.locale,
		sourceHash,
		statusUnavailable,
		t,
		notificationKey,
		txChain,
	]);

	return null;
}
