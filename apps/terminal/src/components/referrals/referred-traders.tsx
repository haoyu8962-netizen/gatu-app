import { Trans, useLingui } from "@lingui/react/macro";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@sairn/ui";
import { useState } from "react";
import { MobileProgressiveList } from "@/components/trade/mobile/mobile-progressive-list";
import { formatDateTime, formatToken, formatUSD, shortenAddress } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import type { ReferralTokenMetadata, ReferredTrader } from "@/lib/trade/referral";

interface Props {
	traders: ReferredTrader[];
	tokenMetadata: ReadonlyMap<number, ReferralTokenMetadata> | null;
}

const DESKTOP_PAGE_SIZE = 25;

export function ReferredTraders({ traders, tokenMetadata }: Props) {
	useNumberFormatRevision();
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
					<TableRow className="h-[30px]">
						<TableHead size="dense" className="text-xs">
							<Trans>Trader</Trans>
						</TableHead>
						<TableHead size="dense" className="text-xs">
							<Trans>Joined</Trans>
						</TableHead>
						<TableHead size="dense" className="text-right text-xs">
							<Trans>USDC volume</Trans>
						</TableHead>
						<TableHead size="dense" className="text-right text-xs">
							<Trans>Trader fee benefit</Trans>
						</TableHead>
						<TableHead size="dense" className="text-right text-xs">
							<Trans>Your rewards</Trans>
						</TableHead>
						<TableHead size="dense" className="text-right text-xs">
							<Trans>Reward assets</Trans>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{desktopTraders.map((trader) => (
						<TableRow key={trader.user} className="h-[42px]">
							<TableCell size="dense" className="text-2sm font-medium text-fg">
								<bdi dir="ltr">{shortenAddress(trader.user, 6, 4)}</bdi>
							</TableCell>
							<TableCell size="dense" className="text-2sm">
								{formatDateTime(trader.timeJoined)}
							</TableCell>
							<TableCell size="dense" className="text-right text-2sm tabular-nums">
								{formatUSD(trader.cumVlm)}
							</TableCell>
							<TableCell size="dense" className="text-right text-2sm tabular-nums">
								{formatUSD(trader.cumRewardedFeesSinceReferred)}
							</TableCell>
							<TableCell size="dense" className="text-right text-2sm tabular-nums">
								{formatUSD(trader.cumFeesRewardedToReferrer)}
							</TableCell>
							<TableCell size="dense" className="text-right text-2sm tabular-nums">
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
							<article key={trader.user} className="px-4 py-3">
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="text-2sm font-medium text-fg">
											<bdi dir="ltr">{shortenAddress(trader.user, 6, 4)}</bdi>
										</p>
										<p className="mt-0.5 text-2xs tabular-nums text-fg-muted">
											{formatDateTime(trader.timeJoined)} · <Trans>Volume</Trans> {formatUSD(trader.cumVlm)}
										</p>
									</div>
									<p className="text-2sm font-semibold tabular-nums text-success">
										+{formatUSD(trader.cumFeesRewardedToReferrer)}
									</p>
								</div>
								<div className="mt-2 flex items-center justify-between gap-3 text-2xs">
									<span className="text-fg-muted">
										<Trans>Trader fee benefit</Trans>
									</span>
									<span className="tabular-nums text-fg">{formatUSD(trader.cumRewardedFeesSinceReferred)}</span>
								</div>
								{trader.tokenToState.length ? (
									<details className="mt-2 py-2">
										<summary className="cursor-pointer text-2xs font-medium text-fg-muted">
											<Trans>Reward assets</Trans>
										</summary>
										<div className="mt-2 space-y-2">
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
									</details>
								) : null}
							</article>
						))
					}
				</MobileProgressiveList>
			</div>
		</>
	);
}
