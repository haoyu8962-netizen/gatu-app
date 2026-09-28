import { useLingui } from "@lingui/react/macro";
import { InfoRow } from "@/components/ui/info-row";
import {
	getLeveragePositionLimit,
	hasLeveragePositionLimits,
	type MarginTierInput,
} from "@/domain/trade/order/liquidation";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { formatLeveragePositionLimit } from "@/lib/trade/leverage-position-limit-presentation";

interface Props {
	marginTiers: readonly MarginTierInput[] | null | undefined;
	quoteSymbol: string | null | undefined;
	leverage: number;
}

export function LeveragePositionLimitRow({ marginTiers, quoteSymbol, leverage }: Props) {
	const numberFormatRevision = useNumberFormatRevision();
	const { t } = useLingui();

	if (!hasLeveragePositionLimits(marginTiers)) return null;

	const value = formatLeveragePositionLimit(
		{ limit: getLeveragePositionLimit(marginTiers, leverage), quoteSymbol, noTierLimitLabel: t`No tier limit` },
		numberFormatRevision,
	);

	return (
		<InfoRow
			className="min-h-4 gap-3 whitespace-nowrap p-0 text-xs"
			label={t`Max position size`}
			labelClassName="min-w-0 truncate text-trading-panel-muted"
			value={value}
			valueClassName="shrink-0 font-medium text-trading-panel-fg"
		/>
	);
}
