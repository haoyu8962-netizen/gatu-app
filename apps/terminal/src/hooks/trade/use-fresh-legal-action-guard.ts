import {
	type HyperliquidEnv,
	LegalActionNotAllowedError,
	useHyperliquid,
	verifyLegalActionAllowed,
} from "@sairn/hl-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { isAddress } from "viem";

interface LegalActionIdentity {
	env: HyperliquidEnv;
	/** The account the write is about to sign for; the selected owner must be this account. */
	owner?: string;
}

interface CurrentLegalActionIdentity {
	clientKey: string;
	env: HyperliquidEnv;
	info: ReturnType<typeof useHyperliquid>["info"];
	sessionMode: ReturnType<typeof useHyperliquid>["sessionMode"];
}

function getSelectedLegalOwner(current: CurrentLegalActionIdentity, expectedEnv: HyperliquidEnv): `0x${string}` | null {
	if (current.env !== expectedEnv || current.clientKey === "disconnected" || !isAddress(current.clientKey)) return null;
	return current.clientKey.toLowerCase() as `0x${string}`;
}

function createLegalIdentityUnavailableError(): LegalActionNotAllowedError {
	return new LegalActionNotAllowedError("status_unavailable", { statusReason: "unknown" });
}

/**
 * Performs an online legal-status preflight for a funds write and rejects a
 * result if the active owner or environment changed while the request ran,
 * or if the selected owner is not the account the write signs for.
 */
export function useFreshLegalActionGuard() {
	const queryClient = useQueryClient();
	const { clientKey, env, info, sessionMode } = useHyperliquid();
	const currentIdentityRef = useRef<CurrentLegalActionIdentity>({ clientKey, env, info, sessionMode });
	currentIdentityRef.current = { clientKey, env, info, sessionMode };

	const verify = useCallback(
		async ({ env: expectedEnv, owner: expectedOwner }: LegalActionIdentity): Promise<void> => {
			const before = currentIdentityRef.current;
			const owner = getSelectedLegalOwner(before, expectedEnv);
			if (!owner) throw createLegalIdentityUnavailableError();
			if (expectedOwner !== undefined && owner !== expectedOwner.toLowerCase()) {
				throw createLegalIdentityUnavailableError();
			}

			await verifyLegalActionAllowed({
				queryClient,
				info: before.info,
				env: expectedEnv,
				owner,
				forceFresh: true,
			});

			const after = currentIdentityRef.current;
			if (
				getSelectedLegalOwner(after, expectedEnv) !== owner ||
				after.info !== before.info ||
				after.sessionMode !== before.sessionMode
			) {
				throw createLegalIdentityUnavailableError();
			}
		},
		[queryClient],
	);

	return { env, verify };
}
