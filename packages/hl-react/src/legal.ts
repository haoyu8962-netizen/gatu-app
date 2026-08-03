import type { IRequestTransport } from "@nktkas/hyperliquid";
import {
	type AbstractWallet,
	getWalletAddress,
	getWalletChainId,
	type Signature,
	signUserSignedAction,
} from "@nktkas/hyperliquid/signing";
import { z } from "zod";
import { WalletAccountMismatchError } from "./errors";
import type { HyperliquidEnv } from "./signing/types";

const LEGAL_RESTRICTIONS = ["n", "a", "o", "u"] as const;

const LegalCheckResponseSchema = z.object({
	acceptedTerms: z.boolean(),
	userAllowed: z.boolean(),
	restrictions: z.string().optional(),
});

export type LegalRestriction = (typeof LEGAL_RESTRICTIONS)[number];

export interface LegalStatus {
	acceptedTerms: boolean;
	userAllowed: boolean;
	restriction: LegalRestriction | "unknown";
	canPerformActions: boolean;
	canViewOutcomeMarkets: boolean;
	canUseReferrals: boolean;
}

export interface AcceptTermsRequest {
	type: "acceptTerms2";
	user: `0x${string}`;
	time: number;
	signature: Signature;
	signatureChainId: `0x${string}`;
}

interface AcceptHyperliquidTermsOptions {
	wallet: AbstractWallet;
	transport: IRequestTransport;
	env: HyperliquidEnv;
	user: `0x${string}`;
	time?: number;
}

const ACCEPT_TERMS_TYPES = {
	"Hyperliquid:AcceptTerms": [
		{ name: "hyperliquidChain", type: "string" },
		{ name: "time", type: "uint64" },
	],
} as const;

function isLegalRestriction(value: string | undefined): value is LegalRestriction {
	return value !== undefined && (LEGAL_RESTRICTIONS as readonly string[]).includes(value);
}

export function parseLegalStatus(value: unknown): LegalStatus {
	const response = LegalCheckResponseSchema.parse(value);
	const restriction = isLegalRestriction(response.restrictions) ? response.restrictions : "unknown";
	const restrictionKnown = restriction !== "unknown";

	return {
		acceptedTerms: response.acceptedTerms,
		userAllowed: response.userAllowed,
		restriction,
		canPerformActions: response.userAllowed && restrictionKnown && restriction !== "a",
		canViewOutcomeMarkets: response.userAllowed && restrictionKnown && restriction !== "o" && restriction !== "u",
		canUseReferrals: response.userAllowed && restrictionKnown && restriction !== "u",
	};
}

export async function acceptHyperliquidTerms({
	wallet,
	transport,
	env,
	user,
	time = Date.now(),
}: AcceptHyperliquidTermsOptions): Promise<AcceptTermsRequest> {
	const normalizedUser = user.toLowerCase() as `0x${string}`;
	const walletAddress = await getWalletAddress(wallet);
	if (walletAddress.toLowerCase() !== normalizedUser) throw new WalletAccountMismatchError();

	const signatureChainId = await getWalletChainId(wallet);
	const signature = await signUserSignedAction({
		wallet,
		action: {
			signatureChainId,
			hyperliquidChain: env,
			time,
		},
		types: ACCEPT_TERMS_TYPES,
	});
	const request: AcceptTermsRequest = {
		type: "acceptTerms2",
		user: normalizedUser,
		time,
		signature,
		signatureChainId,
	};

	await transport.request<unknown>("info", request);
	return request;
}
