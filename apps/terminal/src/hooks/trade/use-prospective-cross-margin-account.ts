import { useEffect, useMemo, useState } from "react";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { getPositionDex } from "@/domain/market";
import {
	areProspectiveAccountSnapshotsFresh,
	areProspectiveAccountSnapshotsIndividuallyFresh,
	type CrossMarginAccountInput,
	type ExistingPositionInput,
	PROSPECTIVE_ACCOUNT_SNAPSHOT_MAX_AGE_MS,
	resolveCrossMarginAccount,
} from "@/domain/trade/order/liquidation";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useMarketsInfo } from "@/lib/hyperliquid";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import { useDexBalances } from "./use-account-balances";

function getDefaultCollateralToken(markets: ReturnType<typeof useMarketsInfo>): number | null {
	for (const market of markets.spotMarkets) {
		for (const token of market.tokensInfo) {
			if (token.name === DEFAULT_QUOTE_TOKEN) return token.index;
		}
	}
	for (const market of markets.builderPerpMarkets.all) {
		if (market.quoteToken?.name === DEFAULT_QUOTE_TOKEN) return market.quoteToken.index;
	}
	return null;
}

/**
 * Returns the exact account pool required by the protocol's cross-liquidation
 * equation. Incomplete, stale, portfolio-margin, or ambiguously mapped state
 * returns null so the order summary can fail closed.
 */
export interface ProspectiveCrossMarginSnapshot {
	account: CrossMarginAccountInput | null;
	existingPosition: ExistingPositionInput | null;
}

const EMPTY_SNAPSHOT: ProspectiveCrossMarginSnapshot = { account: null, existingPosition: null };

type SnapshotCandidate =
	| { status: "unavailable" }
	| { status: "awaiting-pair"; now: number }
	| {
			status: "ready";
			snapshot: ProspectiveCrossMarginSnapshot;
			revision: string;
			pairedAt: number;
	  };

interface CachedSnapshot {
	key: string;
	revision: string;
	pairedAt: number;
	snapshot: ProspectiveCrossMarginSnapshot;
}

export function useProspectiveCrossMarginAccount(
	market: UnifiedMarketInfo | undefined,
): ProspectiveCrossMarginSnapshot {
	const resolvedDex = market ? getPositionDex(market) : undefined;
	const dex = resolvedDex ?? "";
	const balances = useDexBalances(dex);
	const markets = useMarketsInfo();
	const { address } = useWalletSession();
	const defaultCollateralToken = getDefaultCollateralToken(markets);
	const snapshotKey = [
		address?.toLowerCase() ?? "disconnected",
		market?.kind ?? "missing",
		market?.assetId ?? "missing",
		market?.name ?? "missing",
		dex,
		balances.accountAbstraction ?? "missing",
		market?.kind === "builderPerp" ? (market.quoteToken?.index ?? "missing") : (defaultCollateralToken ?? "missing"),
	].join(":");
	const [lastReadySnapshot, setLastReadySnapshot] = useState<CachedSnapshot | null>(null);

	const candidate = useMemo<SnapshotCandidate>(() => {
		if (!market || market.kind === "spot") return { status: "unavailable" };
		if (market.kind === "builderPerp" && resolvedDex === undefined) return { status: "unavailable" };
		const selectedCollateralToken =
			market.kind === "builderPerp" ? (market.quoteToken?.index ?? null) : defaultCollateralToken;
		const dexCollateralTokens = [
			...(defaultCollateralToken === null ? [] : [{ dex: "", token: defaultCollateralToken }]),
			...markets.builderPerpMarkets.all.flatMap((builderMarket) =>
				builderMarket.quoteToken ? [{ dex: builderMarket.dex, token: builderMarket.quoteToken.index }] : [],
			),
		];
		const allDexStates = balances.allDexClearinghouseStates.map(([stateDex, state]) => ({
			dex: stateDex,
			crossMaintenanceMarginUsed: state.crossMaintenanceMarginUsed,
			positions: state.assetPositions.map(({ position }) => ({
				marginMode: position.leverage.type,
				marginUsed: position.marginUsed,
			})),
		}));
		const needsUnifiedSnapshots = balances.accountAbstraction === "unifiedAccount";
		const now = Date.now();
		const hasUnifiedSources =
			balances.hasAllDexsSnapshot &&
			balances.hasSpotStateSnapshot &&
			balances.perpStateStatus === "success" &&
			balances.spotStateStatus === "success";
		const snapshotsAreFresh = areProspectiveAccountSnapshotsFresh({
			perpReceivedAt: balances.perpStateReceivedAt,
			spotReceivedAt: balances.spotStateReceivedAt,
			requireSpot: needsUnifiedSnapshots,
			now,
		});
		const snapshotsAreIndividuallyFresh =
			needsUnifiedSnapshots &&
			areProspectiveAccountSnapshotsIndividuallyFresh({
				perpReceivedAt: balances.perpStateReceivedAt,
				spotReceivedAt: balances.spotStateReceivedAt,
				now,
			});
		if (needsUnifiedSnapshots && hasUnifiedSources && snapshotsAreIndividuallyFresh && !snapshotsAreFresh) {
			return { status: "awaiting-pair", now };
		}
		const selectedState = balances.allDexClearinghouseStates.find(([stateDex]) => stateDex === dex)?.[1];
		const dataReady = needsUnifiedSnapshots
			? hasUnifiedSources && snapshotsAreFresh
			: balances.hasAllDexsSnapshot &&
				selectedState !== undefined &&
				balances.perpStateStatus === "success" &&
				snapshotsAreFresh;

		const selectedPositions = selectedState?.assetPositions;
		const selectedPosition = selectedPositions?.find(({ position }) => position.coin === market.name)?.position;
		const existingPosition = selectedPosition
			? {
					signedSize: selectedPosition.szi,
					positionValue: selectedPosition.positionValue,
					marginUsed: selectedPosition.marginUsed,
					marginMode: selectedPosition.leverage.type,
					leverage: selectedPosition.leverage.value,
				}
			: null;
		const account = resolveCrossMarginAccount({
			accountMode: balances.accountAbstraction,
			selectedDex: dex,
			selectedCollateralToken,
			selectedCrossAccountValue: selectedState?.crossMarginSummary.accountValue ?? null,
			selectedCrossMaintenanceMarginUsed: selectedState?.crossMaintenanceMarginUsed ?? null,
			allDexStates,
			dexCollateralTokens,
			spotBalances: balances.spotBalances.flatMap((balance) =>
				"token" in balance && typeof balance.token === "number" ? [{ token: balance.token, total: balance.total }] : [],
			),
			dataReady,
		});
		if (!account) return { status: "unavailable" };

		const snapshot = { account, existingPosition };
		const pairedAt = needsUnifiedSnapshots
			? Math.max(balances.perpStateReceivedAt ?? 0, balances.spotStateReceivedAt ?? 0)
			: (balances.perpStateReceivedAt ?? 0);
		return {
			status: "ready",
			snapshot,
			pairedAt,
			revision: `${balances.perpStateReceivedAt ?? "missing"}:${balances.spotStateReceivedAt ?? "missing"}:${JSON.stringify(snapshot)}`,
		};
	}, [balances, defaultCollateralToken, dex, market, markets, resolvedDex]);

	useEffect(() => {
		if (candidate.status !== "ready") return;
		setLastReadySnapshot((current) => {
			if (current?.key === snapshotKey && current.revision === candidate.revision) return current;
			return {
				key: snapshotKey,
				revision: candidate.revision,
				pairedAt: candidate.pairedAt,
				snapshot: candidate.snapshot,
			};
		});
	}, [candidate, snapshotKey]);

	if (candidate.status === "ready") return candidate.snapshot;
	if (
		candidate.status === "awaiting-pair" &&
		lastReadySnapshot?.key === snapshotKey &&
		candidate.now >= lastReadySnapshot.pairedAt &&
		candidate.now - lastReadySnapshot.pairedAt <= PROSPECTIVE_ACCOUNT_SNAPSHOT_MAX_AGE_MS
	) {
		return lastReadySnapshot.snapshot;
	}
	return EMPTY_SNAPSHOT;
}
