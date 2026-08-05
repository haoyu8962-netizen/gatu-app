import { Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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
import { Placeholder } from "./placeholder";
import { positionsPanelTableShellClass, positionsPanelTabRootClass } from "./positions-panel-table-styles";

const twapGridClass =
	"grid min-w-[1280px] grid-cols-[110px_90px_minmax(18rem,1fr)_130px_130px_110px_150px] gap-x-4 px-5";

export function TwapTab() {
	const { t } = useLingui();
	const { address, isConnected } = useWalletSession();
	const navigateToMarket = useMarketNavigation();
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

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view TWAP orders.`}</Placeholder>;
		if (viewState === "loading") return <Placeholder>{t`Loading TWAP orders...`}</Placeholder>;
		if (viewState === "error") {
			return (
				<Placeholder variant="error">
					<span>{t`Failed to load TWAP orders.`}</span>
					{error instanceof Error && <span className="mt-1 text-xs text-fg-muted">{error.message}</span>}
				</Placeholder>
			);
		}
		if (activeOrders.length === 0) {
			return (
				<div className="flex h-full w-full flex-col items-center justify-center gap-2.5 px-2 py-14">
					<span
						className="grid size-11 place-items-center rounded-full bg-market-close-hover text-lg text-market-close-subtle"
						aria-hidden="true"
					>
						⏱
					</span>
					<span className="text-[13px] font-semibold text-market-close-muted">{t`No active TWAP orders.`}</span>
					<span className="text-xs text-market-close-subtle">
						{t`Create a TWAP order from Advanced order settings to execute it in smaller batches.`}
					</span>
					{viewState === "ready" ? (
						<button
							type="button"
							onClick={() => setOrderType("twap")}
							className="mt-1 rounded-[7px] border border-market-close-stroke-control px-3.5 py-1.5 text-xs font-semibold text-market-close-fg transition-colors duration-[120ms] hover:border-market-close-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
						>
							{t`Create TWAP`}
						</button>
					) : null}
				</div>
			);
		}
		return null;
	}

	const placeholder = renderPlaceholder();
	const renderTimeMs = Date.now();

	return (
		<div className={positionsPanelTabRootClass}>
			{feedback ? (
				<div
					role={feedback.tone === "error" ? "alert" : "status"}
					className={cn("px-5 py-1 text-xs", feedback.tone === "error" ? "text-error" : "text-warning")}
				>
					{feedback.message}
				</div>
			) : null}
			{viewState === "stale" ? (
				<output className="block px-5 py-1 text-xs text-warning">
					{t`TWAP data may be stale while the connection recovers.`}
				</output>
			) : null}
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<ScrollArea className="h-full w-full">
						<table aria-label={t`Active TWAP orders`} className="block min-w-[1280px] border-collapse">
							<thead className="block">
								<tr
									className={cn(
										twapGridClass,
										"h-[33px] items-center border-b border-market-close-stroke-card text-[11px] font-semibold text-market-close-subtle",
									)}
								>
									<th scope="col" className="p-0 text-left font-semibold">
										{t`Asset`}
									</th>
									<th scope="col" className="p-0 text-left font-semibold">
										{t`Direction`}
									</th>
									<th scope="col" className="p-0 text-left font-semibold">
										{t`Execution Progress`}
									</th>
									<th scope="col" className="p-0 text-right font-semibold">
										{t`Average Fill Price`}
									</th>
									<th scope="col" className="p-0 text-right font-semibold">
										{t`Suborder Frequency`}
									</th>
									<th scope="col" className="p-0 text-right font-semibold">
										{t`Remaining Time`}
									</th>
									<th scope="col" className="p-0 text-right font-semibold">
										{t`Actions`}
									</th>
								</tr>
							</thead>
							<tbody className="block">
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
									const progressLabel = formatPercent(metrics.progressRatio, { decimals: 1, signDisplay: "never" });
									const remainingMs = metrics.remainingMs === null ? null : Number(metrics.remainingMs);

									return (
										<tr
											key={twapId}
											className={cn(
												twapGridClass,
												"h-14 items-center border-b border-market-close-stroke-card/60 transition-colors duration-[120ms] hover:bg-market-close-hover",
											)}
										>
											<td className="p-0">
												<button
													type="button"
													className="rounded-[4px] text-[13px] font-bold text-market-close-fg transition-colors duration-[120ms] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
													onClick={() => navigateToMarket(state.coin)}
													aria-label={t`Switch to ${marketLabel} market`}
												>
													{marketLabel}
												</button>
											</td>
											<td
												className={cn(
													"p-0 whitespace-nowrap text-[11px] font-semibold",
													isBuy ? "text-market-close-success" : "text-market-close-danger",
												)}
											>
												{isBuy ? t`Buy / Long` : t`Sell / Short`}
											</td>
											<td className="flex min-w-0 flex-col gap-1 p-0">
												<div className="flex items-center justify-between gap-3 text-[11px] tabular-nums">
													<span className="shrink-0 whitespace-nowrap text-market-close-muted">
														{formatNumber(state.executedSz, szDecimals)} / {formatNumber(state.sz, szDecimals)}{" "}
														{marketLabel}
													</span>
													<span className="shrink-0 whitespace-nowrap font-bold text-market-close-fg">
														{progressLabel}
													</span>
												</div>
												<div
													role="progressbar"
													aria-valuemin={0}
													aria-valuemax={1}
													aria-valuenow={metrics.progressRatio === null ? undefined : Number(metrics.progressRatio)}
													aria-valuetext={progressLabel}
													aria-label={t`TWAP execution progress`}
													className="h-[5px] overflow-hidden rounded-[3px] bg-market-close-stroke-card"
												>
													<span
														className={cn(
															"block h-full origin-left rounded-[3px]",
															isBuy ? "bg-market-close-success" : "bg-market-close-danger",
														)}
														style={{ transform: `scaleX(${metrics.progressRatio ?? "0"})` }}
													/>
												</div>
											</td>
											<td className="p-0 text-right text-[13px] font-semibold text-market-close-fg tabular-nums">
												{formatPrice(metrics.executedAvgPx, {
													szDecimals,
													marketType: market?.kind === "spot" ? "spot" : "perp",
												})}
											</td>
											<td className="p-0 whitespace-nowrap text-right text-xs text-market-close-muted tabular-nums">
												{t`Every ${TWAP_SUBORDER_INTERVAL_SECONDS} seconds`}
											</td>
											<td className="p-0 whitespace-nowrap text-right text-[13px] text-market-close-fg tabular-nums">
												{remainingMs === null ? (
													"—"
												) : (
													<TimeTicker
														startTime={renderTimeMs}
														durationMs={remainingMs}
														isActive={remainingMs > 0}
														format={(elapsedMs) => formatClockDuration(remainingMs - elapsedMs)}
													/>
												)}
											</td>
											<td className="flex justify-end gap-2 p-0">
												<Tooltip content={t`Hyperliquid does not support pausing active TWAP orders.`}>
													<span className="inline-flex">
														<button
															type="button"
															disabled
															aria-label={t`Pause unavailable: Hyperliquid does not support pausing active TWAP orders.`}
															className="h-[27px] min-h-0 whitespace-nowrap rounded-[7px] border border-market-close-stroke-card px-3 text-xs font-semibold text-market-close-subtle disabled:cursor-not-allowed"
														>
															{t`Pause`}
														</button>
													</span>
												</Tooltip>
												<button
													type="button"
													className="h-[27px] min-h-0 whitespace-nowrap rounded-[7px] border border-market-close-danger-disabled px-3 text-xs font-semibold text-market-close-danger transition-colors duration-[120ms] hover:border-market-close-danger hover:bg-market-close-danger hover:text-market-close-danger-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:opacity-50"
													aria-label={t`Terminate TWAP order`}
													aria-busy={cancellingTwapId === twapId}
													disabled={cancellingTwapId !== null}
													onClick={() => void cancelTwap(state.coin, twapId)}
												>
													{cancellingTwapId === twapId ? t`Terminating...` : t`Terminate`}
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
						<ScrollBar orientation="horizontal" />
					</ScrollArea>
				)}
			</div>
		</div>
	);
}
