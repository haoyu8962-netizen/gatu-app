import { Trans } from "@lingui/react/macro";
import { ClockIcon, CoinsIcon, GlobeHemisphereWestIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { formatUnits } from "viem";
import { InfoRow } from "@/components/ui/info-row";
import { USDC_ICON_URL } from "@/config/bridge";
import { MIN_DEPOSIT_USDC, USDC_DECIMALS } from "@/config/contracts";
import { NETWORKS } from "@/config/networks";

const ARBITRUM_NETWORK = NETWORKS[0];

interface Props {
	networkName: string;
	route?: "bridge" | "cctp";
	cctpFee?: string | null;
	cctpNetAmount?: string | null;
	cctpFeeLoading?: boolean;
}

export function UnitDepositInfo({
	networkName,
	route = "bridge",
	cctpFee,
	cctpNetAmount,
	cctpFeeLoading = false,
}: Props) {
	const minimumDeposit = `${formatUnits(MIN_DEPOSIT_USDC, USDC_DECIMALS)} USDC`;

	return (
		<div className="rounded-8 border border-stroke-weak/40 bg-surface p-3 space-y-2 text-xs">
			<InfoRow
				className="p-0"
				labelClassName="flex items-center gap-1.5 text-fg"
				label={
					<>
						<img src={USDC_ICON_URL} alt="" className="size-3 rounded-full" aria-hidden="true" />
						<Trans>Asset</Trans>
					</>
				}
				value="USDC"
				valueClassName="font-medium"
			/>
			<InfoRow
				className="p-0"
				labelClassName="flex items-center gap-1.5 text-fg"
				label={
					<>
						<GlobeHemisphereWestIcon className="size-3" />
						<Trans>Network</Trans>
					</>
				}
				value={networkName}
				valueClassName="font-medium"
			/>
			<InfoRow
				className="p-0"
				labelClassName="flex items-center gap-1.5 text-fg"
				label={
					<>
						<WarningCircleIcon className="size-3" />
						<Trans>Minimum</Trans>
					</>
				}
				value={minimumDeposit}
				valueClassName="font-medium"
			/>
			<InfoRow
				className="p-0"
				labelClassName="flex items-center gap-1.5 text-fg"
				label={
					<>
						<ClockIcon className="size-3" />
						<Trans>Estimated time</Trans>
					</>
				}
				value={ARBITRUM_NETWORK.estimatedDepositTime}
				valueClassName="font-medium"
			/>
			{route === "cctp" ? (
				<>
					<InfoRow
						className="p-0"
						labelClassName="flex items-center gap-1.5 text-fg"
						label={
							<>
								<CoinsIcon className="size-3" />
								<Trans>Maximum CCTP fee</Trans>
							</>
						}
						value={cctpFeeLoading ? <Trans>Checking...</Trans> : cctpFee ? `${cctpFee} USDC` : "—"}
						valueClassName="font-medium tabular-nums"
					/>
					<InfoRow
						className="p-0"
						labelClassName="flex items-center gap-1.5 text-fg"
						label={<Trans>Estimated net credit</Trans>}
						value={cctpNetAmount ? `${cctpNetAmount} USDC` : "—"}
						valueClassName="font-medium tabular-nums"
					/>
				</>
			) : null}
		</div>
	);
}
