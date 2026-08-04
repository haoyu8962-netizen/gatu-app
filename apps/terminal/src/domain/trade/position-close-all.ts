import type { UnifiedMarket } from "@gatu/hl-react";
import Big from "big.js";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { toBig } from "@/lib/trade/numbers";

export const POSITION_CLOSE_ALL_SNAPSHOT_MAX_AGE_MS = 30_000;

export interface PositionCloseAllCandidate {
	coin: string;
	dex: string;
	assetId: number | undefined;
	szDecimals: number | undefined;
	signedPositionSize: string;
	markPx: string | undefined;
	positionValue: string;
	unrealizedPnl: string;
	marginMode: MarginMode;
	quoteSymbol: string | null | undefined;
}

export interface PositionCloseAllTarget {
	coin: string;
	dex: string;
	assetId: number;
	szDecimals: number;
	signedPositionSize: string;
	markPx: string;
	marginMode: MarginMode;
	quoteSymbol: string;
}

export interface PositionCloseAllSummaryTotal {
	quoteSymbol: string;
	totalNotional: string;
	estimatedPnl: string;
}

export interface PositionCloseAllSnapshot {
	owner: string;
	env: "Mainnet" | "Testnet";
	capturedAtMs: number;
	targets: PositionCloseAllTarget[];
	summaryTotals: PositionCloseAllSummaryTotal[];
}

export type PositionCloseAllSnapshotIssue =
	| "disconnected"
	| "empty"
	| "invalid-market"
	| "invalid-position"
	| "duplicate-market";

export type PositionCloseAllSnapshotResolution =
	| { snapshot: PositionCloseAllSnapshot; issues: [] }
	| { snapshot: null; issues: PositionCloseAllSnapshotIssue[] };

interface ResolvePositionCloseAllSnapshotInput {
	owner: string | null | undefined;
	env: "Mainnet" | "Testnet";
	candidates: readonly PositionCloseAllCandidate[];
	capturedAtMs?: number;
}

export function resolvePositionCloseAllSnapshot({
	owner,
	env,
	candidates,
	capturedAtMs = Date.now(),
}: ResolvePositionCloseAllSnapshotInput): PositionCloseAllSnapshotResolution {
	const normalizedOwner = owner?.trim().toLowerCase();
	const issues = new Set<PositionCloseAllSnapshotIssue>();
	if (!normalizedOwner) issues.add("disconnected");
	if (candidates.length === 0) issues.add("empty");

	const targets: PositionCloseAllTarget[] = [];
	const marketKeys = new Set<string>();
	const assetIds = new Set<number>();
	const totalsByQuote = new Map<string, { totalNotional: Big; estimatedPnl: Big }>();

	for (const candidate of candidates) {
		const positionSize = toBig(candidate.signedPositionSize);
		const markPx = toBig(candidate.markPx);
		const positionValue = toBig(candidate.positionValue);
		const unrealizedPnl = toBig(candidate.unrealizedPnl);
		const quoteSymbol = candidate.quoteSymbol?.trim();
		const validMarket =
			Number.isSafeInteger(candidate.assetId) &&
			(candidate.assetId ?? -1) >= 0 &&
			Number.isSafeInteger(candidate.szDecimals) &&
			(candidate.szDecimals ?? -1) >= 0 &&
			!!quoteSymbol &&
			markPx !== null &&
			markPx.gt(0);
		const validPosition = positionSize?.abs().gt(0) === true && positionValue !== null && unrealizedPnl !== null;

		if (!validMarket) issues.add("invalid-market");
		if (!validPosition) issues.add("invalid-position");
		if (!validMarket || !validPosition || candidate.assetId === undefined || candidate.szDecimals === undefined) {
			continue;
		}

		const marketKey = `${candidate.dex}:${candidate.coin}`;
		if (marketKeys.has(marketKey) || assetIds.has(candidate.assetId)) {
			issues.add("duplicate-market");
			continue;
		}
		marketKeys.add(marketKey);
		assetIds.add(candidate.assetId);
		const totals = totalsByQuote.get(quoteSymbol) ?? { totalNotional: Big(0), estimatedPnl: Big(0) };
		totals.totalNotional = totals.totalNotional.plus(positionValue.abs());
		totals.estimatedPnl = totals.estimatedPnl.plus(unrealizedPnl);
		totalsByQuote.set(quoteSymbol, totals);
		targets.push({
			coin: candidate.coin,
			dex: candidate.dex,
			assetId: candidate.assetId,
			szDecimals: candidate.szDecimals,
			signedPositionSize: positionSize.toString(),
			markPx: markPx.toString(),
			marginMode: candidate.marginMode,
			quoteSymbol,
		});
	}

	if (issues.size > 0 || !normalizedOwner || targets.length !== candidates.length) {
		return { snapshot: null, issues: Array.from(issues) };
	}

	targets.sort((left, right) => left.assetId - right.assetId || left.dex.localeCompare(right.dex));
	return {
		snapshot: {
			owner: normalizedOwner,
			env,
			capturedAtMs,
			targets,
			summaryTotals: Array.from(totalsByQuote, ([quoteSymbol, totals]) => ({
				quoteSymbol,
				totalNotional: totals.totalNotional.toString(),
				estimatedPnl: totals.estimatedPnl.toString(),
			})).sort((left, right) => left.quoteSymbol.localeCompare(right.quoteSymbol)),
		},
		issues: [],
	};
}

export function getPositionCloseAllSnapshotKey(snapshot: PositionCloseAllSnapshot): string {
	return [
		snapshot.owner,
		snapshot.env,
		String(snapshot.capturedAtMs),
		...snapshot.targets.flatMap((target) => [
			target.dex,
			target.coin,
			String(target.assetId),
			String(target.szDecimals),
			target.signedPositionSize,
			target.marginMode,
			target.quoteSymbol,
		]),
	].join(":");
}

export function getPositionCloseAllQuoteSymbol(market: UnifiedMarket | undefined): string | null {
	if (!market || market.kind === "spot") return null;
	if (market.kind === "perp") return DEFAULT_QUOTE_TOKEN;
	const quoteSymbol = market.quoteToken?.displayName?.trim() || market.quoteToken?.name?.trim();
	return quoteSymbol || null;
}
