import { Badge, Button } from "@hypeterminal/ui";
import { Trans } from "@lingui/react/macro";
import { ClockIcon, SpinnerGapIcon, WalletIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { InfoRow, InfoRowGroup } from "@/components/ui/info-row";
import { BRIDGE_TIMEOUT_MS, LIFI_EXPLORER_URL } from "@/config/bridge";
import { shortenAddress } from "@/lib/format";
import { ExplorerLink, HyperCoreUsdcIcon } from "./shared-ui";

const BRIDGE_MESSAGE_MAX_WIDTH = "max-w-70";

interface Props {
	address: string;
	statusText: string;
	txHash: string | null;
	onDone: () => void;
}

export function ExecutingScreen({ address, statusText, txHash, onDone }: Props) {
	const [isTimedOut, setIsTimedOut] = useState(false);
	const startTimeRef = useRef(Date.now());

	useEffect(() => {
		const timer = setInterval(() => {
			if (Date.now() - startTimeRef.current >= BRIDGE_TIMEOUT_MS) {
				setIsTimedOut(true);
				clearInterval(timer);
			}
		}, 30_000);
		return () => clearInterval(timer);
	}, []);

	if (isTimedOut) {
		return (
			<div className="flex flex-1 flex-col">
				<div className="flex flex-1 flex-col items-center justify-center gap-4">
					<div className="flex size-12 items-center justify-center rounded-full bg-warning-soft border border-stroke-warning-strong/30">
						<ClockIcon className="size-6 text-warning" />
					</div>
					<div className="text-center space-y-1">
						<p className="text-sm font-medium text-fg">
							<Trans>Taking longer than expected</Trans>
						</p>
						<p className={`text-xs text-fg-muted ${BRIDGE_MESSAGE_MAX_WIDTH}`}>
							<Trans>Your bridge is still processing. Funds are safe.</Trans>
						</p>
					</div>
					{txHash ? (
						<ExplorerLink href={`${LIFI_EXPLORER_URL}/${txHash}`}>
							<Trans>Track on LI.FI Explorer</Trans>
						</ExplorerLink>
					) : null}
				</div>
				<Button variant="outline" intent="neutral" size="lg" className="w-full mt-auto" onClick={onDone}>
					<Trans>Close</Trans>
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col gap-4">
			<div className="flex flex-1 flex-col items-center justify-center gap-4">
				<div className="flex size-12 items-center justify-center rounded-full bg-brand/10 border border-stroke-brand-strong/30">
					<SpinnerGapIcon className="size-6 animate-spin text-brand" />
				</div>
				<div className="text-center space-y-1">
					<p className="text-sm font-medium text-fg">{statusText}</p>
					<p className="text-xs text-fg-muted">
						{txHash ? (
							<Trans>Your transaction is being processed</Trans>
						) : (
							<Trans>Confirm transaction in your wallet</Trans>
						)}
					</p>
				</div>
			</div>

			{txHash ? (
				<div className="space-y-3">
					<InfoRowGroup className="text-xs">
						<InfoRow
							label={<Trans>Fill status</Trans>}
							value={
								<Badge tone="neutral" size="sm">
									<Trans>Processing</Trans>
								</Badge>
							}
						/>
						<InfoRow
							label={<Trans>Source</Trans>}
							value={
								<ExplorerLink href={`${LIFI_EXPLORER_URL}/${txHash}`}>
									<WalletIcon className="size-3" />
									{shortenAddress(address)}
								</ExplorerLink>
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
									<Trans>USDC</Trans>
								</span>
							}
						/>
					</InfoRowGroup>
				</div>
			) : null}

			<Button variant="outline" intent="neutral" size="lg" className="w-full mt-auto" onClick={onDone}>
				<Trans>Close</Trans>
			</Button>
		</div>
	);
}
