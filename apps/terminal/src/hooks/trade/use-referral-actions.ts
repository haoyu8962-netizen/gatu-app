import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { accountLedgerQueryKey } from "@/hooks/trade/use-account-ledger";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { isAmbiguousExchangeActionError } from "@/lib/errors/format";
import { infoKey, infoPersistedKey, useExchange, useHyperliquid, useLegalStatus } from "@/lib/hyperliquid";
import type { ReferralData } from "@/lib/trade/referral";
import {
	canApplyReferralCode,
	hasClaimableReferralRewards,
	isReferralMutationReconciled,
	isValidReferralCode,
} from "@/lib/trade/referral";

export type ReferralAction = "apply" | "claim" | "create";

export interface ReferralActionIdentity {
	clientKey: string;
	env: "Mainnet" | "Testnet";
	walletAddress: string | undefined;
}

interface Input {
	refetchReferral: () => Promise<ReferralData>;
	refreshAfterAction: (includeLedger: boolean) => Promise<void>;
}

interface Result {
	identity: ReferralActionIdentity;
	isPending: boolean;
	submit: (action: ReferralAction, code?: string) => Promise<void>;
}

function assertCode(code: string | undefined): asserts code is string {
	if (typeof code !== "string" || !isValidReferralCode(code)) {
		throw new Error("Referral codes must be between 1 and 20 characters");
	}
}

export class ReferralActionStatusUnknownError extends Error {
	constructor(cause?: unknown) {
		super("Referral request was submitted but its final status could not be confirmed", { cause });
		this.name = "ReferralActionStatusUnknownError";
	}
}

function waitForReconciliationAttempt(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 600));
}

function assertActionAvailable(action: ReferralAction, data: ReferralData, code?: string): void {
	if (action === "apply") {
		assertCode(code);
		if (data.referredBy !== null) throw new Error("This account already has a referral code");
		if (!canApplyReferralCode(data)) {
			throw new Error("Referral codes cannot be applied after cumulative volume exceeds $10,000");
		}
		return;
	}
	if (action === "create") {
		assertCode(code);
		if (data.referrerState.stage !== "needToCreateCode") {
			throw new Error("This account is not currently eligible to create a referral code");
		}
		return;
	}
	if (!hasClaimableReferralRewards(data)) throw new Error("There are no eligible rewards available to claim");
}

function assertIdentityUnchanged(startIdentity: ReferralActionIdentity, currentIdentity: ReferralActionIdentity): void {
	if (
		currentIdentity.clientKey.toLowerCase() !== startIdentity.clientKey.toLowerCase() ||
		currentIdentity.env !== startIdentity.env ||
		currentIdentity.walletAddress?.toLowerCase() !== startIdentity.walletAddress?.toLowerCase()
	) {
		throw new Error("Wallet or network changed before the referral request could be confirmed");
	}
}

export function useReferralActions({ refetchReferral, refreshAfterAction }: Input): Result {
	const queryClient = useQueryClient();
	const { env, clientKey } = useHyperliquid();
	const { hasWalletAccess, walletAddress } = useWalletSession();
	const legalStatus = useLegalStatus();
	const identity: ReferralActionIdentity = { clientKey, env, walletAddress };
	const identityRef = useRef(identity);
	const pendingIdentityRef = useRef<ReferralActionIdentity | null>(null);
	identityRef.current = identity;
	const executionGuard = () => {
		const pendingIdentity = pendingIdentityRef.current;
		if (!pendingIdentity) throw new Error("Referral request is no longer active");
		assertIdentityUnchanged(pendingIdentity, identityRef.current);
	};
	const setReferrer = useExchange("setReferrer", { executionGuard });
	const registerReferrer = useExchange("registerReferrer", { executionGuard });
	const claimRewards = useExchange("claimRewards", { executionGuard });
	const isPending = setReferrer.isPending || registerReferrer.isPending || claimRewards.isPending;

	async function submit(action: ReferralAction, code?: string): Promise<void> {
		const startIdentity = identity;
		if (pendingIdentityRef.current) throw new Error("Another referral request is already in progress");
		pendingIdentityRef.current = startIdentity;
		try {
			if (!hasWalletAccess || !walletAddress || clientKey === "disconnected") {
				throw new Error("Connect the selected owner wallet before continuing");
			}
			if (walletAddress.toLowerCase() !== clientKey.toLowerCase()) {
				throw new Error("The active wallet does not match this Hyperliquid account");
			}

			const legal = await legalStatus.refetch();
			assertIdentityUnchanged(startIdentity, identityRef.current);
			if (legal.error || !legal.data?.acceptedTerms || !legal.data.userAllowed || !legal.data.canUseReferrals) {
				throw new Error("Referral access could not be verified for this account");
			}

			const before = await refetchReferral();
			assertIdentityUnchanged(startIdentity, identityRef.current);
			assertActionAvailable(action, before, code);
			assertIdentityUnchanged(startIdentity, identityRef.current);

			let mutationError: unknown;
			try {
				if (action === "apply") {
					await setReferrer.mutateAsync({ code: code as string });
				} else if (action === "create") {
					await registerReferrer.mutateAsync({ code: code as string });
				} else {
					await claimRewards.mutateAsync(undefined);
				}
			} catch (error) {
				mutationError = error;
				if (!isAmbiguousExchangeActionError(error)) throw error;
			}

			let reconciled = false;
			for (let attempt = 0; attempt < 6; attempt += 1) {
				assertIdentityUnchanged(startIdentity, identityRef.current);
				let after: ReferralData | null = null;
				try {
					after = await refetchReferral();
				} catch {
					after = null;
				}
				assertIdentityUnchanged(startIdentity, identityRef.current);
				if (after && isReferralMutationReconciled(action, before, after, code)) {
					reconciled = true;
					break;
				}
				if (attempt < 5) await waitForReconciliationAttempt();
			}

			if (!reconciled) {
				throw new ReferralActionStatusUnknownError(mutationError);
			}
			assertIdentityUnchanged(startIdentity, identityRef.current);

			await Promise.all([
				queryClient.invalidateQueries({ queryKey: infoKey("referral", { user: clientKey }, env), exact: true }),
				queryClient.invalidateQueries({ queryKey: infoKey("userFees", { user: clientKey }, env), exact: true }),
				queryClient.invalidateQueries({
					queryKey: infoPersistedKey("userFees", { user: clientKey }, env),
					exact: true,
				}),
			]);
			if (action === "claim") {
				await queryClient.invalidateQueries({ queryKey: accountLedgerQueryKey(env, clientKey), exact: true });
			}
			assertIdentityUnchanged(startIdentity, identityRef.current);
			await refreshAfterAction(action === "claim");
			assertIdentityUnchanged(startIdentity, identityRef.current);
		} finally {
			if (pendingIdentityRef.current === startIdentity) pendingIdentityRef.current = null;
		}
	}

	return { identity, isPending, submit };
}
