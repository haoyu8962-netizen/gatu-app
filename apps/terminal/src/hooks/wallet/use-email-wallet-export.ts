import { useLingui } from "@lingui/react/macro";
import { useExportWallet } from "@privy-io/react-auth";
import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getPrivyEmailAddress, getPrivyEmbeddedWalletAddress, hasSameWalletAddress } from "@/lib/wallet/privy-wagmi";
import { useWalletSession } from "./use-wallet-session";

export function useEmailWalletExport() {
	const { t } = useLingui();
	const session = useWalletSession();
	const { exportWallet } = useExportWallet();
	const visible =
		session.authenticationReady &&
		session.authenticated &&
		!!getPrivyEmailAddress(session.user) &&
		session.sessionMode !== "agent-only" &&
		session.walletIntent !== "external";
	const owner = session.embeddedWalletAddress;
	const eligible =
		visible &&
		session.ready &&
		session.walletIntent === "embedded" &&
		!!session.user?.id &&
		!!owner &&
		hasSameWalletAddress(owner, getPrivyEmbeddedWalletAddress(session.user));
	const identity = eligible ? `${session.user?.id}:${owner.toLowerCase()}` : null;
	const current = useRef<object | null>(null);
	const inFlight = useRef(false);
	const [pending, setPending] = useState<object | null>(null);
	const scope = useRef<{ identity: string | null; epoch: object }>({ identity, epoch: {} });
	const epoch = scope.current.identity === identity ? scope.current.epoch : {};

	useLayoutEffect(() => {
		scope.current = { identity, epoch };
		current.current = epoch;
		return () => {
			current.current = null;
		};
	}, [identity, epoch]);

	async function exportEmailWallet(beforeOpen?: () => void) {
		if (!eligible || !owner || !identity || current.current !== epoch || inFlight.current) return;
		inFlight.current = true;
		setPending(epoch);
		try {
			beforeOpen?.();
			if (current.current !== epoch) return;
			await exportWallet({ address: owner });
		} catch {
			if (current.current === epoch)
				toast.error(
					t`Could not open wallet export. Retry in your system browser on the same GATU site, using the same email.`,
				);
		} finally {
			inFlight.current = false;
			if (current.current !== null) setPending(null);
		}
	}

	return { visible, canExport: eligible && pending === null, exportEmailWallet };
}
