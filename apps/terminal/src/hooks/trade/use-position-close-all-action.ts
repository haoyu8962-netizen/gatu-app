import { useLingui } from "@lingui/react/macro";
import {
	getPositionCloseAllQuoteSymbol,
	type PositionCloseAllSnapshotIssue,
	resolvePositionCloseAllSnapshot,
} from "@/domain/trade/position-close-all";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useHyperliquid, useMarkets, useUserPositions } from "@/lib/hyperliquid";
import { usePositionCloseAllSession, usePositionDialogActions } from "@/stores/use-position-dialog-store";

export function usePositionCloseAllAction() {
	const { t } = useLingui();
	const { address, isConnected } = useWalletSession();
	const { clientKey, env } = useHyperliquid();
	const markets = useMarkets();
	const { positions, isLoading, hasError, isStale } = useUserPositions();
	const session = usePositionCloseAllSession();
	const { openCloseAll } = usePositionDialogActions();
	const identityReady =
		isConnected && !!address && clientKey !== "disconnected" && address.toLowerCase() === clientKey.toLowerCase();
	const dataReady = !isLoading && !hasError && !isStale && !markets.isLoading && !markets.error;
	const hasSession = !!address && session?.snapshot.owner === address.toLowerCase() && session.snapshot.env === env;

	function resolveSnapshot() {
		return resolvePositionCloseAllSnapshot({
			owner: address,
			env,
			candidates: positions.map((position) => {
				const market = markets.getMarket(position.coin);
				return {
					coin: position.coin,
					dex: position.dex,
					assetId: market?.assetId,
					szDecimals: market?.szDecimals,
					signedPositionSize: position.szi,
					positionValue: position.positionValue,
					unrealizedPnl: position.unrealizedPnl,
					marginMode: position.leverage.type,
					quoteSymbol: getPositionCloseAllQuoteSymbol(market),
				};
			}),
		});
	}

	const resolution = resolveSnapshot();
	const issues: readonly PositionCloseAllSnapshotIssue[] = resolution.issues;
	const canOpen = identityReady && dataReady && resolution.snapshot !== null && !hasSession;

	function getUnavailableReason() {
		if (canOpen || hasSession) return null;
		if (!identityReady) return t`Close all is currently unavailable.`;
		if (!dataReady || issues.includes("invalid-market")) {
			return t`Close all is unavailable until every position market has loaded.`;
		}
		if (issues.includes("invalid-position")) {
			return t`Close all is unavailable because position data is incomplete.`;
		}
		if (issues.includes("duplicate-market")) {
			return t`Close all is unavailable because duplicate market data was detected.`;
		}
		return t`Close all is currently unavailable.`;
	}

	function open() {
		if (!canOpen) return;
		const current = resolveSnapshot();
		if (current.snapshot) openCloseAll(current.snapshot);
	}

	return { canOpen, open, unavailableReason: getUnavailableReason() };
}
