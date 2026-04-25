import { Button } from "@hypeterminal/ui";
import { Trans } from "@lingui/react/macro";
import { CaretDownIcon, CaretUpIcon, CheckCircleIcon, WalletIcon } from "@phosphor-icons/react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InfoRow, InfoRowGroup } from "@/components/ui/info-row";
import { LIFI_EXPLORER_URL } from "@/config/bridge";
import { formatTokenAmount, processTypeLabel } from "@/lib/bridge/format";
import { formatDateTimeShort, shortenAddress } from "@/lib/format";
import type { ProcessDetail } from "@/lib/lifi/use-bridge";
import { ExplorerLink, HyperCoreUsdcIcon } from "./shared-ui";

interface Props {
	address: string;
	receivedAmount: string;
	txHash: string | null;
	startTime: number | null;
	endTime: number | null;
	processDetails: ProcessDetail[];
	onDone: () => void;
	onNewDeposit: () => void;
}

export function SuccessScreen({
	address,
	receivedAmount,
	txHash,
	startTime,
	endTime,
	processDetails,
	onDone,
	onNewDeposit,
}: Props) {
	const formatted = formatTokenAmount(receivedAmount, 6);
	const totalSeconds = startTime && endTime ? Math.round((endTime - startTime) / 1000) : null;

	return (
		<div className="flex flex-1 flex-col gap-4">
			<div className="flex flex-col items-center gap-3 pt-6 pb-2">
				<div className="flex size-12 items-center justify-center rounded-full bg-success-soft border border-stroke-success-strong/30">
					<CheckCircleIcon className="size-6 text-success" weight="fill" />
				</div>
				<div className="text-center space-y-1">
					<p className="text-sm font-medium text-fg">
						<Trans>Deposit successful</Trans>
					</p>
					<p className="text-xs text-fg-muted">
						<Trans>Your funds were successfully deposited.</Trans>
					</p>
				</div>
			</div>

			<InfoRowGroup className="text-xs">
				<InfoRow
					label={<Trans>Fill status</Trans>}
					value={
						<span className="text-success font-medium">
							<Trans>Successful</Trans>
						</span>
					}
				/>
				{totalSeconds !== null ? (
					<InfoRow label={<Trans>Total time</Trans>} value={<Trans>{totalSeconds} seconds</Trans>} />
				) : null}
			</InfoRowGroup>

			<InfoRowGroup className="text-xs">
				<InfoRow
					label={<Trans>Source</Trans>}
					value={
						txHash ? (
							<ExplorerLink href={`${LIFI_EXPLORER_URL}/${txHash}`}>
								<WalletIcon className="size-3" />
								{shortenAddress(address)}
							</ExplorerLink>
						) : (
							<span className="flex items-center gap-1.5">
								<WalletIcon className="size-3" />
								{shortenAddress(address)}
							</span>
						)
					}
				/>
				<InfoRow label={<Trans>Destination</Trans>} value="Hyperliquid" />
			</InfoRowGroup>

			<InfoRowGroup className="text-xs">
				<InfoRow
					label={<Trans>You receive</Trans>}
					value={
						<span className="flex items-center gap-1.5">
							<HyperCoreUsdcIcon size="sm" />
							{formatted} USDC
						</span>
					}
				/>
			</InfoRowGroup>

			{processDetails.length > 0 ? (
				<Collapsible>
					<CollapsibleTrigger className="flex w-full items-center justify-between rounded-8 px-2 py-1.5 text-xs text-fg-muted hover:bg-fill-hover transition-colors group">
						<Trans>More details</Trans>
						<CaretDownIcon className="size-3 group-data-[state=open]:hidden" />
						<CaretUpIcon className="size-3 hidden group-data-[state=open]:block" />
					</CollapsibleTrigger>
					<CollapsibleContent>
						<InfoRowGroup className="text-xs">
							{processDetails.map((detail) => (
								<InfoRow
									key={detail.txHash}
									label={processTypeLabel(detail.type)}
									value={
										<ExplorerLink href={detail.txLink || `${LIFI_EXPLORER_URL}/${detail.txHash}`}>
											{shortenAddress(detail.txHash)}
										</ExplorerLink>
									}
								/>
							))}
							{processDetails[0]?.startedAt ? (
								<InfoRow
									label={<Trans>Order submitted</Trans>}
									value={formatDateTimeShort(processDetails[0].startedAt)}
								/>
							) : null}
							{(() => {
								const lastDetail = processDetails.at(-1);
								if (!lastDetail?.doneAt) return null;
								return <InfoRow label={<Trans>Order filled</Trans>} value={formatDateTimeShort(lastDetail.doneAt)} />;
							})()}
						</InfoRowGroup>
					</CollapsibleContent>
				</Collapsible>
			) : null}

			<div className="flex gap-2 w-full mt-auto">
				<Button variant="outline" intent="neutral" size="lg" className="flex-1" onClick={onDone}>
					<Trans>Close</Trans>
				</Button>
				<Button variant="filled" intent="brand" size="lg" className="flex-1" onClick={onNewDeposit}>
					<Trans>New deposit</Trans>
				</Button>
			</div>
		</div>
	);
}
