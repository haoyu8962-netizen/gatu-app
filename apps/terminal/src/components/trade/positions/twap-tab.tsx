import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { useMemo } from "react";
import { useConnection } from "wagmi";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { TimeTicker } from "@/components/ui/time-ticker";
import { HL_ALL_DEXS } from "@/config/constants";
import { getAvgPrice } from "@/domain/market";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDuration, formatNumber, formatPrice } from "@/lib/format";
import { useMarkets, useSubscription } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useMarketActions } from "@/stores/use-market-store";
import { AssetDisplay } from "../components/asset-display";
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

interface PlaceholderProps {
	children: React.ReactNode;
	variant?: "error";
}

function Placeholder({ children, variant }: PlaceholderProps) {
	return (
		<div
			className={cn(
				"h-full w-full flex flex-col items-center justify-center px-2 py-6 text-xs",
				variant === "error" ? "text-text-error" : "text-text-weak",
			)}
		>
			{children}
		</div>
	);
}

export function TwapTab() {
	const { address, isConnected } = useConnection();
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();
	const { data: twapStatesEvent } = useSubscription(
		"twapStates",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const markets = useMarkets();

	const twapStates = twapStatesEvent?.states ?? [];

	const activeOrders = useMemo(
		() =>
			twapStates.map(([twapId, state]) => ({ twapId, state })).sort((a, b) => b.state.timestamp - a.state.timestamp),
		[twapStates],
	);

	const activeCount = activeOrders.length;

	const headerCount = isConnected ? `${activeCount} ${t`active`}` : null;

	const twapStatesStatus = twapStatesEvent ? "active" : "loading";

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view TWAP orders.`}</Placeholder>;
		if (twapStatesStatus === "loading") return <Placeholder>{t`Loading TWAP orders...`}</Placeholder>;
		if (activeOrders.length === 0) return <Placeholder>{t`No active TWAP orders.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTabRootClass}>
			<div className={positionsPanelTableCaptionRowClass}>
				{headerCount ? <span className="tabular-nums text-3xs text-text-weak">{headerCount}</span> : null}
			</div>
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<ScrollArea className="h-full w-full">
						<Table className="table-fixed min-w-[58rem] w-full">
							<TableHeader className={positionsPanelTableHeaderClass}>
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[18%] text-left")}>
										{t`Asset`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[10%] text-right")}>
										{t`Size`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[10%] text-right")}>
										{t`Executed`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[14%] text-right")}>
										{t`Avg Price`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[14%] text-left")}>
										{t`Time / Total`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[10%] text-left")}>
										{t`Reduce Only`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[14%] text-left")}>
										{t`Created`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[10%] text-right")}>
										{t`Actions`}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={positionsPanelTableBodyClass}>
								{activeOrders.map(({ twapId, state }, i) => {
									const isBuy = state.side === "B";
									const sideClass = isBuy
										? "bg-fill-success-weak text-text-success"
										: "bg-fill-error-weak text-text-error";
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
											<TableCell className={cn(positionsPanelTableCellClass, "font-medium text-text-strong")}>
												<div className="flex items-center gap-1.5">
													<span className={cn("text-xs px-1 py-0.5 rounded-8 uppercase", sideClass)}>
														{isBuy ? t`buy` : t`sell`}
													</span>
													<Button
														variant="link"
														onClick={() => setSelectedMarket(scope, state.coin)}
														className="gap-1.5"
														aria-label={t`Switch to ${state.coin} market`}
													>
														<AssetDisplay coin={state.coin} />
													</Button>
												</div>
											</TableCell>
											<TableCell
												className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-text-strong")}
											>
												{formatNumber(totalSize, szDecimals)}
											</TableCell>
											<TableCell className={cn(positionsPanelTableCellClass, "text-right tabular-nums")}>
												<span className={cn(isBuy ? "text-text-success" : "text-text-error")}>
													{formatNumber(executedSize, szDecimals)}
												</span>
											</TableCell>
											<TableCell
												className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-text-strong")}
											>
												{formatPrice(avgPrice, { szDecimals })}
											</TableCell>
											<TableCell className={cn(positionsPanelTableCellClass, "tabular-nums text-text-strong")}>
												<TimeTicker startTime={creationTime} durationMs={totalMinutes * 60 * 1000} isActive={true} /> /{" "}
												{formatDuration(totalMinutes)}
											</TableCell>
											<TableCell className={cn(positionsPanelTableCellClass, "text-text-strong")}>
												{state.reduceOnly ? t`Yes` : t`No`}
											</TableCell>
											<TableCell className={cn(positionsPanelTableCellClass, "tabular-nums text-text-strong")}>
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
											<TableCell className={cn(positionsPanelTableCellClass, "text-right")}>
												<Button variant="outline" intent="error" size="sm" aria-label={t`Cancel TWAP order`}>
													{t`Cancel`}
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
