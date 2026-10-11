import { useLingui } from "@lingui/react/macro";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";

export function useMasterWalletRequiredMessage(): string {
	const { t } = useLingui();
	return t`This phone uses a desktop-approved trading key. This action needs the master wallet on desktop.`;
}

export function useMasterWalletActionReason(): string | null {
	const message = useMasterWalletRequiredMessage();
	const { sessionMode } = useWalletSession();
	return sessionMode === "agent-only" ? message : null;
}
