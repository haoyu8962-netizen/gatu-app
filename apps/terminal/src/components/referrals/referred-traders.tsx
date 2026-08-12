import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { MobileProgressiveList } from "@/components/trade/mobile/mobile-progressive-list";
import { formatDateTime, formatToken, formatUSD, shortenAddress } from "@/lib/format";
import type { ReferralTokenMetadata, ReferredTrader } from "@/lib/trade/referral";

interface Props {
	traders: ReferredTrader[];
	tokenMetadata: ReadonlyMap<number, ReferralTokenMetadata> | null;
}

const DESKTOP_PAGE_SIZE = 25;

export function ReferredTraders({ traders, tokenMetadata }: Props) {
	const { t } = useLingui();
	const [currentPage, setCurrentPage] = useState(1);
	const totalPages = Math.max(1, Math.ceil(traders.length / DESKTOP_PAGE_SIZE));
	const visiblePage = Math.min(currentPage, totalPages);
	const desktopTraders = traders.slice((visiblePage - 1) * DESKTOP_PAGE_SIZE, visiblePage * DESKTOP_PAGE_SIZE);
	const getTokenName = (tokenId: number) => tokenMetadata?.get(tokenId)?.name ?? `Token #${tokenId}`;

	return (
		<>
			<Table className="hidden min-[1001px]:table" containerClassName="hidden min-[1001px]:block">
				<TableHeader>
					<TableRow>
						<TableHead size="dense">
							<Trans>Trader</Trans>
						</TableHead>
						<TableHead size="dense">
							<Trans>Joined</Trans>
						</TableHead>
						<TableHead size="dense" className="text-right">
							<Trans>USDC volume</Trans>
						</TableHead>
						<TableHead size="dense" className="text-right">
							<Trans>Trader fee benefit</Trans>
						</TableHead>
						<TableHead size="dense" className="text-right">
							<Trans>Your rewards</Trans>
						</TableHead>
						<TableHead size="dense" className="text-right">
							<Trans>Reward assets</Trans>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{desktopTraders.map((trader) => (
						<TableRow key={trader.user}>
							<TableCell size="dense" className="font-medium text-fg">
								{shortenAddress(trader.user, 6, 4)}
							</TableCell>
							<TableCell size="dense">{formatDateTime(trader.timeJoined)}</TableCell>
							<TableCell size="dense" className="text-right tabular-nums">
								{formatUSD(trader.cumVlm)}
							</TableCell>
							<TableCell size="dense" className="text-right tabular-nums">
								{formatUSD(trader.cumRewardedFeesSinceReferred)}
							</TableCell>
							<TableCell size="dense" className="text-right tabular-nums">
								{formatUSD(trader.cumFeesRewardedToReferrer)}
							</TableCell>
							<TableCell size="dense" className="text-right tabular-nums">
								<span
									className="line-clamp-1"
									title={trader.tokenToState.map(([tokenId]) => getTokenName(tokenId)).join(", ")}
								>
									{trader.tokenToState.map(([tokenId]) => getTokenName(tokenId)).join(", ") || "—"}
								</span>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			{totalPages > 1 ? (
				<nav
					aria-label={t`Referred traders pages`}
					className="hidden items-center justify-between border-t border-stroke-weak px-6 py-3 min-[1001px]:flex"
				>
					<p className="text-xs tabular-nums text-fg-muted">
						<Trans>
							Page {visiblePage} of {totalPages}
						</Trans>
					</p>
					<div className="flex gap-2">
						<Button
							variant="outline"
							intent="neutral"
							size="xs"
							disabled={visiblePage === 1}
							onClick={() => setCurrentPage(visiblePage - 1)}
						>
							<Trans>Previous</Trans>
						</Button>
						<Button
							variant="outline"
							intent="neutral"
							size="xs"
							disabled={visiblePage === totalPages}
							onClick={() => setCurrentPage(visiblePage + 1)}
						>
							<Trans>Next</Trans>
						</Button>
					</div>
				</nav>
			) : null}
			<div className="divide-y divide-stroke-weak min-[1001px]:hidden">
				<MobileProgressiveList items={traders}>
					{(visibleTraders) =>
						visibleTraders.map((trader) => (
							<article key={trader.user} className="space-y-3 px-4 py-4">
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="text-sm font-semibold text-fg">{shortenAddress(trader.user, 6, 4)}</p>
										<p className="mt-0.5 text-2xs text-fg-muted">{formatDateTime(trader.timeJoined)}</p>
									</div>
									<p className="text-sm font-semibold tabular-nums text-fg">{formatUSD(trader.cumVlm)}</p>
								</div>
								<div className="grid grid-cols-2 gap-3 rounded-10 bg-fill-weak p-3">
									<div>
										<p className="text-2xs text-fg-muted">
											<Trans>Trader fee benefit</Trans>
										</p>
										<p className="mt-1 text-xs font-medium tabular-nums text-fg">
											{formatUSD(trader.cumRewardedFeesSinceReferred)}
										</p>
									</div>
									<div>
										<p className="text-2xs text-fg-muted">
											<Trans>Your rewards</Trans>
										</p>
										<p className="mt-1 text-xs font-medium tabular-nums text-fg">
											{formatUSD(trader.cumFeesRewardedToReferrer)}
										</p>
									</div>
								</div>
								{trader.tokenToState.length ? (
									<div className="space-y-2 rounded-10 border border-stroke-weak p-3">
										{trader.tokenToState.map(([tokenId, state]) => {
											const metadata = tokenMetadata?.get(tokenId);
											const tokenName = metadata?.name ?? `Token #${tokenId}`;
											return (
												<div key={tokenId} className="flex items-center justify-between gap-3 text-2xs">
													<span className="font-medium text-fg">{tokenName}</span>
													<span className="text-right tabular-nums text-fg-muted">
														<Trans>Volume</Trans>{" "}
														{formatToken(state.cumVlm, {
															symbol: tokenName,
															maximumFractionDigits: metadata?.weiDecimals ?? 8,
														})}
														· <Trans>Rewards</Trans>{" "}
														{formatToken(state.cumFeesRewardedToReferrer, {
															symbol: tokenName,
															maximumFractionDigits: metadata?.weiDecimals ?? 8,
														})}
													</span>
												</div>
											);
										})}
									</div>
								) : null}
							</article>
						))
					}
				</MobileProgressiveList>
			</div>
		</>
	);
}
