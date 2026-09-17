import type { MessageDescriptor } from "@lingui/core";
import { ACCOUNT_LABELS } from "@/config/account-labels";
import { formatNumber, formatPercent, formatUSD } from "@/lib/format";

export function getDisconnectedAccountOverviewRows(
	t: (descriptor: MessageDescriptor) => string,
	_numberFormatRevision: number,
) {
	return [
		{ key: "margin-ratio", label: t(ACCOUNT_LABELS.marginRatio), value: formatPercent(0, 2) },
		{ key: "portfolio-value", label: t(ACCOUNT_LABELS.portfolioValue), value: formatUSD(0, { compact: false }) },
		{ key: "unrealized-pnl", label: t(ACCOUNT_LABELS.unrealizedPnl), value: formatUSD(0, { compact: false }) },
		{ key: "maintenance-margin", label: t(ACCOUNT_LABELS.maintenanceMargin), value: formatUSD(0, { compact: false }) },
		{ key: "account-leverage", label: t(ACCOUNT_LABELS.accountLeverage), value: `${formatNumber(0, 2)}x` },
	];
}
