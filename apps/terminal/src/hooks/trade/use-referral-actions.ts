import { msg } from "@lingui/core/macro";
import {
	assertExchangeSigningDeadline,
	startExchangeActionDeadline,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { accountLedgerQueryKey } from "@/hooks/trade/use-account-ledger";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { isAmbiguousExchangeActionError } from "@/lib/errors/format";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
import { getReferralActionGeo, type ReferralActionGeoDecision } from "@/lib/geo/get-referral-action-geo";
import { infoKey, infoPersistedKey, useExchange, useHyperliquid, useLegalStatus } from "@/lib/hyperliquid";
import type { ReferralData } from "@/lib/trade/referral";
import {
	canApplyReferralCode,
	hasUnclaimedReferralRewards,
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
	if (!hasUnclaimedReferralRewards(data)) throw new Error("There are no unclaimed rewards available to claim");
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

function getDevGeoOverride(): string | null {
	if (!import.meta.env.DEV || typeof window === "undefined") return null;
	return new URLSearchParams(window.location.search).get("geo");
}

function assertGeoAllowed(
	decision: ReferralActionGeoDecision,
): asserts decision is Extract<ReferralActionGeoDecision, { status: "allowed" }> {
	if (decision.status === "blocked") {
		throw new LocalizedActionError(
			msg`Referral actions are not available in your region. This referral request was not submitted.`,
		);
	}
	if (decision.status === "unavailable") {
		throw new LocalizedActionError(
			msg`Unable to verify regional availability. This referral request was not submitted.`,
		);
	}
}

interface ReferralGeoLease {
	deadline: number;
}

export function useReferralActions({ refetchReferral, refreshAfterAction }: Input): Result {
	const queryClient = useQueryClient();
	const { env, clientKey } = useHyperliquid();
	const { hasWalletAccess, walletAddress } = useWalletSession();
	const legalStatus = useLegalStatus();
	const identity: ReferralActionIdentity = { clientKey, env, walletAddress };
	const identityRef = useRef(identity);
	const mountedRef = useRef(true);
	const pendingIdentityRef = useRef<ReferralActionIdentity | null>(null);
	const geoLeaseRef = useRef<ReferralGeoLease | null>(null);
	identityRef.current = identity;
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);
	const assertRequestActive = (startIdentity: ReferralActionIdentity) => {
		if (!mountedRef.current) throw new LocalizedActionError(msg`Referral request is no longer active.`);
		assertIdentityUnchanged(startIdentity, identityRef.current);
	};
	const executionGuard = () => {
		const pendingIdentity = pendingIdentityRef.current;
		if (!pendingIdentity) throw new LocalizedActionError(msg`Referral request is no longer active.`);
		assertRequestActive(pendingIdentity);
		const geoLease = geoLeaseRef.current;
		if (!geoLease || performance.now() >= geoLease.deadline) {
			throw new LocalizedActionError(
				msg`The regional availability check expired before signing. This referral request was not submitted.`,
			);
		}
	};
	const setReferrer = useExchange("setReferrer", { executionGuard });
	const registerReferrer = useExchange("registerReferrer", { executionGuard });
	const claimRewards = useExchange("claimRewards", { executionGuard });
	const isPending = setReferrer.isPending || registerReferrer.isPending || claimRewards.isPending;

	async function submit(action: ReferralAction, code?: string): Promise<void> {
		const deadline = startExchangeActionDeadline();
		const startIdentity = identity;
		if (pendingIdentityRef.current) {
			throw new LocalizedActionError(
				msg`Another referral request is already in progress. Try again after it finishes.`,
			);
		}
		pendingIdentityRef.current = startIdentity;
		geoLeaseRef.current = null;
		try {
			assertRequestActive(startIdentity);
			if (!hasWalletAccess || !walletAddress || clientKey === "disconnected") {
				throw new Error("Connect the selected owner wallet before continuing");
			}
			if (walletAddress.toLowerCase() !== clientKey.toLowerCase()) {
				throw new Error("The active wallet does not match this Hyperliquid account");
			}

			const legal = await legalStatus.refetch();
			assertRequestActive(startIdentity);
			if (legal.error || !legal.data?.acceptedTerms || !legal.data.userAllowed || !legal.data.canUseReferrals) {
				throw new Error("Referral access could not be verified for this account");
			}

			const before = await refetchReferral();
			assertRequestActive(startIdentity);
			assertActionAvailable(action, before, code);

			const geoRequestStartedAt = performance.now();
			const geoDecision = await getReferralActionGeo({ data: { override: getDevGeoOverride() } });
			assertRequestActive(startIdentity);
			assertGeoAllowed(geoDecision);
			geoLeaseRef.current = { deadline: geoRequestStartedAt + geoDecision.ttlMs };

			let mutationError: unknown;
			try {
				assertExchangeSigningDeadline(deadline);
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
				assertRequestActive(startIdentity);
				let after: ReferralData | null = null;
				try {
					after = await refetchReferral();
				} catch {
					after = null;
				}
				assertRequestActive(startIdentity);
				if (after && isReferralMutationReconciled(action, before, after, code)) {
					reconciled = true;
					break;
				}
				if (attempt < 5) await waitForReconciliationAttempt();
			}

			if (!reconciled) {
				throw new ReferralActionStatusUnknownError(mutationError);
			}
			assertRequestActive(startIdentity);

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
			assertRequestActive(startIdentity);
			await refreshAfterAction(action === "claim");
			assertRequestActive(startIdentity);
		} finally {
			geoLeaseRef.current = null;
			if (pendingIdentityRef.current === startIdentity) pendingIdentityRef.current = null;
		}
	}

	return { identity, isPending, submit };
}
