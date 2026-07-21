import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { TimeTicker } from "@/components/ui/time-ticker";
import { HL_ALL_DEXS } from "@/config/app";
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
import { Placeholder } from "./placeholder";
import {
	positionsPanelRowHoverClass,
	positionsPanelRowStripeClass,
	positionsPanelTableBodyClass,
	positionsPanelTableCaptionRowClass,
	positionsPanelTableCellClass,
	positionsPanelTableHeadClass,
	positionsPanelTableHeaderClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";

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

	const twapStates = twapStatesEvent?.states ?? [];

	const activeOrders = useMemo(
		() =>
			twapStates.map(([twapId, state]) => ({ twapId, state })).sort((a, b) => b.state.timestamp - a.state.timestamp),
		[twapStates],
	);

	const activeCount = activeOrders.length;

	const viewState = getTwapViewState({ isConnected, status, hasData: twapStatesEvent !== undefined, isStale });
	const headerCount = viewState === "ready" || viewState === "stale" ? `${activeCount} ${t`active`}` : null;

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
		if (activeOrders.length === 0) return <Placeholder>{t`No active TWAP orders.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTabRootClass}>
			<div className={positionsPanelTableCaptionRowClass}>
				{headerCount ? <span className="tabular-nums text-3xs text-fg-muted">{headerCount}</span> : null}
			</div>
			{feedback ? (
				<div
					role={feedback.tone === "error" ? "alert" : "status"}
					className={cn("px-2.5 py-1 text-2xs", feedback.tone === "error" ? "text-error" : "text-warning")}
				>
					{feedback.message}
				</div>
			) : null}
			{viewState === "stale" ? (
				<output className="block px-2.5 py-1 text-2xs text-warning">
					{t`TWAP data may be stale while the connection recovers.`}
				</output>
			) : null}
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<ScrollArea className="h-full w-full">
						<Table className="table-fixed min-w-[58rem] w-full">
							<TableHeader className={positionsPanelTableHeaderClass}>
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" size="dense" className={cn(positionsPanelTableHeadClass, "w-[18%] text-left")}>
										{t`Asset`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[10%] text-right")}
									>
										{t`Size`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[10%] text-right")}
									>
										{t`Executed`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[14%] text-right")}
									>
										{t`Avg Price`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(positionsPanelTableHeadClass, "w-[14%] text-left")}>
										{t`Time / Total`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(positionsPanelTableHeadClass, "w-[10%] text-left")}>
										{t`Reduce Only`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(positionsPanelTableHeadClass, "w-[14%] text-left")}>
										{t`Created`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[10%] text-right")}
									>
										{t`Actions`}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={positionsPanelTableBodyClass}>
								{activeOrders.map(({ twapId, state }, i) => {
									const isBuy = state.side === "B";
									const totalSize = toBig(state.sz)?.toNumber() ?? Number.NaN;
									const executedSize = toBig(state.executedSz)?.toNumber() ?? 0;
									const avgPrice = getAvgPrice(state.executedNtl, state.executedSz);
									const szDecimals = markets.getSzDecimals(state.coin);
									const creationTime = state.timestamp;
									const totalMinutes = state.minutes;

									return (
										<TableRow
											key={twapId}
											className={cn(positionsPanelRowHoverClass, i % 2 === 1 && positionsPanelRowStripeClass)}
										>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "font-medium text-fg")}>
												<AssetBadge
													coin={state.coin}
													side={isBuy ? "buy" : "sell"}
													onClick={() => navigateToMarket(state.coin)}
													aria-label={
														isBuy
															? t`Switch to ${state.coin} market, buy TWAP`
															: t`Switch to ${state.coin} market, sell TWAP`
													}
												/>
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-fg")}
											>
												{formatNumber(totalSize, szDecimals)}
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "text-right tabular-nums")}>
												<span className={cn(isBuy ? "text-success" : "text-error")}>
													{formatNumber(executedSize, szDecimals)}
												</span>
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-fg")}
											>
												{formatPrice(avgPrice, { szDecimals })}
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "tabular-nums text-fg")}>
												<TimeTicker startTime={creationTime} durationMs={totalMinutes * 60 * 1000} isActive={true} /> /{" "}
												{formatDuration(totalMinutes)}
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "text-fg")}>
												{state.reduceOnly ? t`Yes` : t`No`}
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "tabular-nums text-fg")}>
												{formatDateTime(creationTime, {
													day: "2-digit",
													month: "2-digit",
													year: "numeric",
													hour: "2-digit",
													minute: "2-digit",
													second: "2-digit",
													hour12: false,
												})}
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "text-right")}>
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
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
						<ScrollBar orientation="horizontal" />
					</ScrollArea>
				)}
			</div>
		</div>
	);
}
