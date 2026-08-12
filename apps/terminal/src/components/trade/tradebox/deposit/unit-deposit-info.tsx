import { Trans } from "@lingui/react/macro";
import { formatUnits } from "viem";
import { InfoRow } from "@/components/ui/info-row";
import { MIN_DEPOSIT_USDC, USDC_DECIMALS } from "@/config/contracts";
import { NETWORKS } from "@/config/networks";

const ARBITRUM_NETWORK = NETWORKS[0];

interface Props {
	networkName: string;
	cctpFee?: string | null;
	cctpNetAmount?: string | null;
	cctpFeeLoading?: boolean;
}

export function UnitDepositInfo({ networkName, cctpFee, cctpNetAmount, cctpFeeLoading = false }: Props) {
	const minimumDeposit = `${formatUnits(MIN_DEPOSIT_USDC, USDC_DECIMALS)} USDC`;

	return (
		<div className="space-y-2 rounded-[10px] border border-market-close-stroke-card bg-market-close-card px-3.5 py-3 text-xs">
			<InfoRow
				className="p-0"
				labelClassName="text-market-close-muted"
				label={<Trans>Asset</Trans>}
				value="USDC"
				valueClassName="font-semibold text-market-close-fg"
			/>
			<InfoRow
				className="p-0"
				labelClassName="text-market-close-muted"
				label={<Trans>Network</Trans>}
				value={networkName}
				valueClassName="font-semibold text-market-close-fg"
			/>
			<InfoRow
				className="p-0"
				labelClassName="text-market-close-muted"
				label={<Trans>Minimum</Trans>}
				value={minimumDeposit}
				valueClassName="font-semibold text-market-close-fg"
			/>
			<InfoRow
				className="p-0"
				labelClassName="text-market-close-muted"
				label={<Trans>Estimated time</Trans>}
				value={ARBITRUM_NETWORK.estimatedDepositTime}
				valueClassName="font-semibold text-market-close-fg"
			/>
			<InfoRow
				className="border-t border-dashed border-market-close-stroke-card p-0 pt-2"
				labelClassName="text-market-close-muted"
				label={<Trans>Maximum CCTP fee</Trans>}
				value={cctpFeeLoading ? <Trans>Checking...</Trans> : cctpFee ? `${cctpFee} USDC` : "—"}
				valueClassName="font-semibold tabular-nums text-market-close-fg"
			/>
			<InfoRow
				className="p-0"
				labelClassName="text-market-close-muted"
				label={<Trans>Estimated net credit</Trans>}
				value={cctpNetAmount ? `${cctpNetAmount} USDC` : "—"}
				valueClassName="font-semibold tabular-nums text-market-close-fg"
			/>
		</div>
	);
}
