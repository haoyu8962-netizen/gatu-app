import type { LiFiStep } from "@lifi/sdk";
import { getQuote } from "@lifi/sdk";
import { useQuery } from "@tanstack/react-query";
import Big from "big.js";

import { BRIDGE_QUOTE_VALIDITY_MS } from "@/config/bridge";
import { HYPERCORE_CHAIN_ID, HYPERCORE_USDC_ADDRESS } from "@/config/contracts";

interface QuoteParams {
	fromChainId: number;
	fromTokenAddress: string;
	fromTokenDecimals: number;
	fromAddress: string;
	amount: string;
}

function toSmallestUnit(amount: string, decimals: number): string {
	return Big(amount).times(Big(10).pow(decimals)).toFixed(0);
}

function isValidAmount(amount: string): boolean {
	if (!amount || amount === "." || amount === "0") return false;
	try {
		return Big(amount).gt(0);
	} catch {
		return false;
	}
}

export interface BridgeQuote {
	step: LiFiStep;
	fromAmount: string;
	fromAmountUSD: string;
	toAmount: string;
	toAmountMin: string;
	toAmountUSD: string;
	executionDuration: number;
	gasCosts: Array<{ amount: string; amountUSD: string; token: { symbol: string } }>;
	feeCosts: Array<{ name: string; amount: string; amountUSD: string; token: { symbol: string }; description: string }>;
	totalFeesUSD: string;
}

export type BridgeQuoteErrorKind = "amount-too-low" | "fees-exceed-amount" | "unavailable";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function collectToolErrorCodes(value: unknown, codes: Set<string>, depth = 0) {
	if (depth > 6) return;
	if (Array.isArray(value)) {
		for (const entry of value) collectToolErrorCodes(entry, codes, depth + 1);
		return;
	}
	if (!isRecord(value)) return;
	if (typeof value.code === "string") codes.add(value.code);
	for (const entry of Object.values(value)) collectToolErrorCodes(entry, codes, depth + 1);
}

export function getBridgeQuoteErrorKind(error: unknown): BridgeQuoteErrorKind {
	let current = error;
	for (let depth = 0; depth < 5 && isRecord(current); depth++) {
		const codes = new Set<string>();
		collectToolErrorCodes(current.responseBody, codes);
		if (codes.size > 0 && [...codes].every((code) => code === "AMOUNT_TOO_LOW")) return "amount-too-low";
		if (codes.size > 0 && [...codes].every((code) => code === "FEES_HIGHER_THAN_AMOUNT")) {
			return "fees-exceed-amount";
		}
		current = current.cause;
	}
	return "unavailable";
}

export function getBridgeQuoteRemainingSeconds(dataUpdatedAt: number, now = Date.now()): number {
	if (dataUpdatedAt <= 0) return 0;
	const remainingMs = BRIDGE_QUOTE_VALIDITY_MS - Math.max(0, now - dataUpdatedAt);
	return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function isBridgeQuoteWorse(current: BridgeQuote, next: BridgeQuote): boolean {
	try {
		return Big(next.toAmountMin).lt(current.toAmountMin);
	} catch {
		return true;
	}
}

function transformQuote(step: LiFiStep): BridgeQuote {
	const estimate = step.estimate ?? {
		fromAmount: "0",
		fromAmountUSD: "0",
		toAmount: "0",
		toAmountMin: "0",
		toAmountUSD: "0",
		executionDuration: 0,
		approvalAddress: "",
		gasCosts: [],
		feeCosts: [],
	};

	const totalFeesUSD = Big(
		(estimate.gasCosts ?? []).reduce(
			(sum, g) =>
				Big(sum)
					.plus(g.amountUSD || "0")
					.toString(),
			"0",
		),
	)
		.plus(
			(estimate.feeCosts ?? []).reduce(
				(sum, f) =>
					Big(sum)
						.plus(f.amountUSD || "0")
						.toString(),
				"0",
			),
		)
		.toString();

	return {
		step,
		fromAmount: estimate.fromAmount,
		fromAmountUSD: estimate.fromAmountUSD ?? "0",
		toAmount: estimate.toAmount,
		toAmountMin: estimate.toAmountMin,
		toAmountUSD: estimate.toAmountUSD ?? "0",
		executionDuration: estimate.executionDuration,
		gasCosts: (estimate.gasCosts ?? []).map((g) => ({
			amount: g.amount,
			amountUSD: g.amountUSD,
			token: { symbol: g.token.symbol },
		})),
		feeCosts: (estimate.feeCosts ?? []).map((f) => ({
			name: f.name,
			amount: f.amount,
			amountUSD: f.amountUSD,
			token: { symbol: f.token.symbol },
			description: f.description,
		})),
		totalFeesUSD,
	};
}

export function useBridgeQuote(params: QuoteParams | null) {
	const enabled = params !== null && isValidAmount(params.amount);

	return useQuery({
		queryKey: ["lifi-quote", params?.fromChainId, params?.fromTokenAddress, params?.fromAddress, params?.amount],
		queryFn: async (): Promise<BridgeQuote> => {
			const p = params as QuoteParams;
			const step = await getQuote({
				fromChain: p.fromChainId,
				fromToken: p.fromTokenAddress,
				fromAddress: p.fromAddress,
				fromAmount: toSmallestUnit(p.amount, p.fromTokenDecimals),
				toChain: HYPERCORE_CHAIN_ID,
				toToken: HYPERCORE_USDC_ADDRESS,
				toAddress: p.fromAddress,
				executionType: "transaction",
			});
			return transformQuote(step);
		},
		enabled,
		staleTime: BRIDGE_QUOTE_VALIDITY_MS,
		refetchInterval: BRIDGE_QUOTE_VALIDITY_MS,
		retry: false,
	});
}
