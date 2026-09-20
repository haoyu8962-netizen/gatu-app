import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useHyperliquid } from "@/lib/hyperliquid";
import {
	usePositionCloseAllSession,
	usePositionDialogActions,
	usePositionLimitCloseSession,
	usePositionReverseSession,
} from "@/stores/use-position-dialog-store";
import { PositionCloseAllController } from "./position-close-all-modal";
import { PositionLimitCloseModal } from "./position-limit-close-modal";
import { PositionReverseConfirmationController } from "./position-reverse-confirmation-controller";

export function PositionDialogHost() {
	const { isConnected, address } = useWalletSession();
	const { clientKey, env } = useHyperliquid();
	const closeAllSession = usePositionCloseAllSession();
	const reverseSession = usePositionReverseSession();
	const limitCloseSession = usePositionLimitCloseSession();
	const { endCloseAll, endReverse, endLimitClose } = usePositionDialogActions();
	const signingIdentityReady =
		isConnected && !!address && clientKey !== "disconnected" && address.toLowerCase() === clientKey.toLowerCase();
	const ownsCloseAllSession =
		signingIdentityReady &&
		closeAllSession?.snapshot.owner === address.toLowerCase() &&
		closeAllSession.snapshot.env === env;

	return (
		<>
			<PositionLimitCloseModal session={limitCloseSession} onSessionEnd={endLimitClose} />
			<PositionReverseConfirmationController session={reverseSession} onSessionEnd={endReverse} />
			<PositionCloseAllController session={ownsCloseAllSession ? closeAllSession : null} onSessionEnd={endCloseAll} />
		</>
	);
}
