import { useLingui } from "@lingui/react/macro";
import { Skeleton } from "boneyard-js/react";
import { useMemo } from "react";
import { TimeTicker } from "@/components/ui/time-ticker";
import { HL_ALL_DEXS } from "@/config/app";
import { TWAP_SUBORDER_INTERVAL_SECONDS } from "@/config/trade";
import { getToolbarTwapMetrics } from "@/domain/trade/trading-toolbar-metrics";
import { getTwapViewState } from "@/domain/trade/twap";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useTwapCancel } from "@/hooks/trade/use-twap-cancel";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatClockDuration, formatNumber, formatPercent, formatPrice } from "@/lib/format";
import { useMarkets, useSubscription } from "@/lib/hyperliquid";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
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
	const { setOrderType } = useOrderEntryActions();

	const twapStates = twapStatesEvent?.states ?? [];
	const activeOrders = useMemo(
		() =>
			twapStates.map(([twapId, state]) => ({ twapId, state })).sort((a, b) => b.state.timestamp - a.state.timestamp),
		[twapStates],
	);

	const viewState = getTwapViewState({ isConnected, status, hasData: twapStatesEvent !== undefined, isStale });
	const isPageScroll = scrollMode === "page";
	const renderTimeMs = Date.now();

	function handleSelectMarket(name: string) {
		navigateToMarket(name, undefined, { displayedContent: "trade" });
		setActiveTab("trade");
	}

	function handleCreateTwap() {
		setOrderType("twap");
		setActiveTab("trade");
	}

	if (!isConnected) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
				{t`Connect your wallet to view TWAP orders.`}
			</div>
		);
	}

	if (viewState === "error") {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm text-market-close-danger">
				<span>{t`Failed to load TWAP orders.`}</span>
				{error instanceof Error && <span className="text-xs text-market-close-muted">{error.message}</span>}
			</div>
		);
	}

	if (viewState === "ready" && activeOrders.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 px-3.5 py-11 text-center">
				<div
					aria-hidden="true"
					className="grid size-10 place-items-center rounded-full bg-market-close-hover text-sm font-bold text-market-close-subtle"
				>
					≡
				</div>
				<span className="text-[13px] font-semibold text-market-close-muted">{t`No active TWAP orders.`}</span>
				<button
					type="button"
					onClick={handleCreateTwap}
					className="mt-1 min-h-11 rounded-[7px] border border-market-close-stroke-control px-3.5 text-xs font-semibold text-market-close-fg outline-none transition-colors duration-[120ms] active:border-market-close-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
				>
					{t`Create TWAP`}
				</button>
			</div>
		);
	}

	return (
		<Skeleton name="twap-tab" loading={viewState === "loading"}>
			<div className={cn("font-market-close min-h-0 flex flex-col", isPageScroll ? "min-h-0" : "flex-1", className)}>
				{feedback ? (
					<div
						role={feedback.tone === "error" ? "alert" : "status"}
						className={cn(
							"px-3.5 pt-3 text-xs",
							feedback.tone === "error" ? "text-market-close-danger" : "text-warning",
						)}
					>
						{feedback.message}
					</div>
				) : null}
				{viewState === "stale" ? (
					<output className="block px-3.5 pt-3 text-xs text-warning">
						{t`TWAP data may be stale while the connection recovers.`}
					</output>
				) : null}
				<div
					className={cn(
						"flex flex-col gap-2.5 px-3.5 py-3",
						!isPageScroll && "min-h-0 flex-1 overflow-y-auto overscroll-y-contain",
					)}
				>
					{viewState === "stale" && activeOrders.length === 0 ? (
						<div className="flex items-center justify-center p-6 text-sm text-market-close-muted">
							{t`No active TWAP orders.`}
						</div>
					) : null}
					{activeOrders.map(({ twapId, state }) => {
						const isBuy = state.side === "B";
						const market = markets.getMarket(state.coin);
						const marketLabel = market?.shortName ?? state.coin;
						const szDecimals = markets.getSzDecimals(state.coin);
						const metrics = getToolbarTwapMetrics({
							sz: state.sz,
							executedSz: state.executedSz,
							executedNtl: state.executedNtl,
							timestampMs: String(state.timestamp),
							minutes: String(state.minutes),
							nowMs: String(renderTimeMs),
						});
						const progressRatio = metrics.progressRatio ?? "0";
						const remainingMs = Number(metrics.remainingMs ?? "0");
						const isCancelling = cancellingTwapId === twapId;

						return (
							<article
								key={twapId}
								className="flex flex-col gap-2.5 rounded-[14px] border border-market-close-stroke-card bg-modal px-3.5 py-3"
							>
								<div className="flex min-w-0 items-center justify-between gap-3">
									<div className="flex min-w-0 items-center gap-2">
										<button
											type="button"
											onClick={() => handleSelectMarket(state.coin)}
											aria-label={t`Switch to ${marketLabel} market`}
											className="-my-3 min-h-11 truncate rounded-[4px] text-sm font-bold text-market-close-fg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
										>
											{marketLabel}
										</button>
										<span
											className={cn(
												"shrink-0 rounded-[4px] px-[7px] py-0.5 text-[10px] font-bold text-market-close-on-control",
												isBuy ? "bg-market-close-success" : "bg-market-close-danger",
											)}
										>
											{isBuy ? t`Buy` : t`Sell`}
										</span>
										{state.reduceOnly ? (
											<span className="shrink-0 rounded-[4px] bg-market-close-hover px-[7px] py-0.5 text-[10px] font-bold text-market-close-muted">
												{t`RO`}
											</span>
										) : null}
									</div>
									<span className="shrink-0 whitespace-nowrap text-xs text-market-close-muted tabular-nums">
										{t`Remaining`}{" "}
										<TimeTicker
											startTime={renderTimeMs}
											durationMs={remainingMs}
											isActive={remainingMs > 0}
											format={(elapsedMs) => formatClockDuration(remainingMs - elapsedMs)}
										/>
									</span>
								</div>

								<div className="flex flex-col gap-1">
									<div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-market-close-muted tabular-nums">
										<span className="min-w-0 truncate whitespace-nowrap">
											{formatNumber(state.executedSz, szDecimals)} / {formatNumber(state.sz, szDecimals)} {marketLabel}
											{" · "}
											{t`Avg Price`}{" "}
											{formatPrice(metrics.executedAvgPx, {
												szDecimals,
												marketType: market?.kind === "spot" ? "spot" : "perp",
											})}
										</span>
										<span className="shrink-0 font-bold text-market-close-fg">
											{formatPercent(metrics.progressRatio, { decimals: 0, signDisplay: "never" })}
										</span>
									</div>
									<div
										role="progressbar"
										aria-label={t`TWAP execution progress`}
										aria-valuemin={0}
										aria-valuemax={1}
										aria-valuenow={Number(progressRatio)}
										aria-valuetext={formatPercent(metrics.progressRatio, { decimals: 0, signDisplay: "never" })}
										className="h-[5px] overflow-hidden rounded-[3px] bg-market-close-stroke-card"
									>
										<div
											data-testid="mobile-twap-progress"
											className={cn(
												"h-full origin-left rounded-[3px]",
												isBuy ? "bg-market-close-success" : "bg-market-close-danger",
											)}
											style={{ transform: `scaleX(${progressRatio})` }}
										/>
									</div>
								</div>

								<div className="flex items-center justify-between gap-3 text-[11px]">
									<span className="text-market-close-subtle">{t`Suborder Frequency`}</span>
									<span className="whitespace-nowrap font-semibold text-market-close-fg tabular-nums">
										{t`${TWAP_SUBORDER_INTERVAL_SECONDS} seconds`}
									</span>
								</div>

								<button
									type="button"
									aria-label={t`Terminate TWAP order`}
									aria-busy={isCancelling}
									disabled={cancellingTwapId !== null}
									onClick={() => void cancelTwap(state.coin, twapId)}
									className="min-h-11 w-full rounded-[8px] border border-market-close-danger-disabled bg-modal px-3 text-xs font-semibold text-market-close-danger outline-none transition-colors duration-[120ms] focus-visible:border-market-close-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:border-market-close-stroke-card disabled:text-market-close-danger-disabled"
								>
									{isCancelling ? t`Terminating...` : t`Terminate`}
								</button>
							</article>
						);
					})}
				</div>
			</div>
		</Skeleton>
	);
}
