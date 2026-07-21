import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { TimerIcon } from "@phosphor-icons/react";
import { Skeleton } from "boneyard-js/react";
import { useMemo } from "react";
import { TimeTicker } from "@/components/ui/time-ticker";
import { FALLBACK_VALUE_PLACEHOLDER, HL_ALL_DEXS } from "@/config/app";
import { getAvgPrice } from "@/domain/market";
import { getTwapViewState } from "@/domain/trade/twap";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useTwapCancel } from "@/hooks/trade/use-twap-cancel";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDuration, formatNumber, formatPrice } from "@/lib/format";
import { useMarkets, useSubscription } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import { AssetBadge } from "../components/asset-badge";
import { MetricCell } from "./metric-cell";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

interface Props {
	className?: string;
	scrollMode?: MobileDataScrollMode;
}

export function MobileTwapTab({ className, scrollMode = "contained" }: Props) {
	const { t } = useLingui();
	const { address, isConnected } = useWalletSession();
	const navigateToMarket = useMarketNavigation();
	const { setActiveTab } = useMobileTerminalTab();
	const {
		data: twapStatesEvent,
		status,
		error,
		isStale,
	} = useSubscription(
		"twapStates",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const markets = useMarkets();
	const { cancelTwap, cancellingTwapId, feedback } = useTwapCancel();

	const twapStates = twapStatesEvent?.states ?? [];
	const activeOrders = useMemo(
		() =>
			twapStates.map(([twapId, state]) => ({ twapId, state })).sort((a, b) => b.state.timestamp - a.state.timestamp),
		[twapStates],
	);

	const viewState = getTwapViewState({ isConnected, status, hasData: twapStatesEvent !== undefined, isStale });
	const headerCount =
		viewState === "ready" || viewState === "stale" ? `${activeOrders.length}` : FALLBACK_VALUE_PLACEHOLDER;
	const isPageScroll = scrollMode === "page";

	function handleSelectMarket(name: string) {
		navigateToMarket(name, undefined, { displayedContent: "trade" });
		setActiveTab("trade");
	}

	if (!isConnected) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-fg-muted">
				{t`Connect your wallet to view TWAP orders.`}
			</div>
		);
	}

	if (viewState === "error") {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm text-error">
				<span>{t`Failed to load TWAP orders.`}</span>
				{error instanceof Error && <span className="text-xs text-fg-muted">{error.message}</span>}
			</div>
		);
	}

	if (viewState === "ready" && activeOrders.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-fg-muted">
				{t`No active TWAP orders.`}
			</div>
		);
	}

	return (
		<Skeleton name="twap-tab" loading={viewState === "loading"}>
			<div className={cn(isPageScroll ? "min-h-0 flex flex-col" : "flex-1 min-h-0 flex flex-col", className)}>
				<div className="px-3 py-2 flex items-center gap-2 text-xs uppercase tracking-wider text-fg-muted">
					<TimerIcon className="size-3" />
					{t`TWAP Orders`}
					<span className="font-semibold text-brand ml-auto tabular-nums">{headerCount}</span>
				</div>
				{feedback ? (
					<div
						role={feedback.tone === "error" ? "alert" : "status"}
						className={cn("px-3 pb-1 text-xs", feedback.tone === "error" ? "text-error" : "text-warning")}
					>
						{feedback.message}
					</div>
				) : null}
				{viewState === "stale" ? (
					<output className="block px-3 pb-1 text-xs text-warning">
						{t`TWAP data may be stale while the connection recovers.`}
					</output>
				) : null}
				<div className={cn("px-3 pb-3 space-y-2", !isPageScroll && "flex-1 min-h-0 overflow-y-auto")}>
					{viewState === "stale" && activeOrders.length === 0 ? (
						<div className="flex items-center justify-center p-6 text-sm text-fg-muted">{t`No active TWAP orders.`}</div>
					) : null}
					{activeOrders.map(({ twapId, state }) => {
						const isBuy = state.side === "B";
						const totalSize = toBig(state.sz)?.toNumber() ?? Number.NaN;
						const executedSize = toBig(state.executedSz)?.toNumber() ?? 0;
						const avgPrice = getAvgPrice(state.executedNtl, state.executedSz);
						const szDecimals = markets.getSzDecimals(state.coin);
						const creationTime = state.timestamp;
						const totalMinutes = state.minutes;

						return (
							<div key={twapId} className="rounded-xs border border-stroke-weak bg-surface overflow-hidden">
								<div className="flex items-center justify-between px-3 py-1.5 border-b border-stroke-weak">
									<div className="flex items-center gap-2">
										<AssetBadge
											coin={state.coin}
											side={isBuy ? "buy" : "sell"}
											onClick={() => handleSelectMarket(state.coin)}
											nameClassName="text-sm"
										/>
										<span className={cn("text-2xs font-medium uppercase", isBuy ? "text-success" : "text-error")}>
											{isBuy ? t`Buy` : t`Sell`}
										</span>
									</div>
									<div className="flex items-center gap-2">
										{state.reduceOnly && (
											<span className="text-xs px-1.5 py-0.5 rounded-xs bg-brand-soft text-brand uppercase">
												{t`RO`}
											</span>
										)}
										<Button
											variant="outline"
											intent="error"
											size="sm"
											aria-label={t`Cancel TWAP order`}
											aria-busy={cancellingTwapId === twapId}
											disabled={cancellingTwapId !== null}
											onClick={() => void cancelTwap(state.coin, twapId)}
										>
											{cancellingTwapId === twapId ? t`Canceling...` : t`Cancel`}
										</Button>
									</div>
								</div>

								<div className="grid grid-cols-3 divide-x divide-stroke-weak">
									<MetricCell label={t`Size`} value={formatNumber(totalSize, szDecimals)} />
									<MetricCell
										label={t`Executed`}
										value={formatNumber(executedSize, szDecimals)}
										valueClass={isBuy ? "text-success" : "text-error"}
									/>
									<MetricCell label={t`Avg Price`} value={formatPrice(avgPrice, { szDecimals })} />
								</div>

								<div className="flex items-center justify-between px-3 py-1.5">
									<div className="text-xs tabular-nums text-fg-muted">
										<TimeTicker startTime={creationTime} durationMs={totalMinutes * 60 * 1000} isActive={true} />
										{" / "}
										{formatDuration(totalMinutes)}
									</div>
									<span className="text-xs text-fg-muted tabular-nums">
										{formatDateTime(creationTime, { dateStyle: "short", timeStyle: "short" })}
									</span>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</Skeleton>
	);
}
