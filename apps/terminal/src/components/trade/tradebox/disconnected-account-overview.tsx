import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { useId } from "react";
import { InfoRow, InfoRowGroup } from "@/components/ui/info-row";
import { formatNumber, formatPercent, formatUSD } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";

interface Props {
	depositEnabled: boolean;
	depositDisabledReason?: string | null;
	onDeposit?: () => void;
}

export function DisconnectedAccountOverview({ depositEnabled, depositDisabledReason, onDeposit }: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const titleId = useId();
	const depositDescriptionId = `${titleId}-deposit`;
	const rows = [
		{ key: "margin-ratio", label: t`Account Margin Ratio`, value: formatPercent(0, 2) },
		{ key: "portfolio-value", label: t`Portfolio Value`, value: formatUSD(0, { compact: false }) },
		{ key: "unrealized-pnl", label: t`Unrealized PNL`, value: formatUSD(0, { compact: false }) },
		{ key: "maintenance-margin", label: t`Cross Maintenance Margin`, value: formatUSD(0, { compact: false }) },
		{ key: "account-leverage", label: t`Cross Account Leverage`, value: `${formatNumber(0, 2)}x` },
	];

	return (
		<div data-slot="disconnected-account-overview" data-grid-content-part className="shrink-0 px-2 pt-3 pb-3">
			<div className="grid grid-cols-2 gap-2">
				<Button
					variant="filled"
					intent="neutral"
					disabled={!depositEnabled}
					focusableWhenDisabled
					aria-describedby={depositDisabledReason ? depositDescriptionId : undefined}
					onClick={depositEnabled ? onDeposit : undefined}
					title={depositDisabledReason ?? undefined}
					className="min-h-8 min-w-0 rounded-8 font-semibold shadow-none"
				>
					{t`Deposit`}
				</Button>
				<Button
					variant="outline"
					intent="neutral"
					disabled
					className="min-h-8 min-w-0 rounded-8 font-semibold shadow-none"
				>
					{t`Withdraw`}
				</Button>
			</div>
			{depositDisabledReason ? (
				<span id={depositDescriptionId} className="sr-only">
					{depositDisabledReason}
				</span>
			) : null}
			<section aria-labelledby={titleId} className="mt-3 border-t border-trading-panel-stroke-row pt-3">
				<h3 id={titleId} className="mb-1 text-2sm font-bold text-trading-panel-fg">
					{t`Overview`}
				</h3>
				<InfoRowGroup className="divide-y-0 tracking-normal">
					{rows.map((row) => (
						<InfoRow
							key={row.key}
							label={row.label}
							value={row.value}
							labelClassName="min-w-0 truncate text-trading-panel-muted"
							valueClassName="shrink-0 whitespace-nowrap font-semibold text-trading-panel-fg tabular-nums"
						/>
					))}
				</InfoRowGroup>
			</section>
		</div>
	);
}
