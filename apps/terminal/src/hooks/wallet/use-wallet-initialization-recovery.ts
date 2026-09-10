import { useEffect, useState } from "react";

export const WALLET_INITIALIZATION_RECOVERY_DELAY_MS = 30_000;

export function useWalletInitializationRecovery(scope: string | null): boolean {
	const [recovery, setRecovery] = useState({ scope, available: false });

	if (recovery.scope !== scope) {
		setRecovery({ scope, available: false });
	}

	useEffect(() => {
		if (scope === null) return;
		const timeout = window.setTimeout(() => {
			setRecovery({ scope, available: true });
		}, WALLET_INITIALIZATION_RECOVERY_DELAY_MS);
		return () => window.clearTimeout(timeout);
	}, [scope]);

	return scope !== null && recovery.scope === scope && recovery.available;
}
