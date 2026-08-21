import { useLingui } from "@lingui/react/macro";
import type { AccountOverviewMode } from "@/domain/trade/account-overview";

interface AccountOverviewLabelsInput {
	accountMode: AccountOverviewMode;
	usesSharedQuoteBalance: boolean;
}

interface AccountOverviewLabels {
	accountMarginRatio: string;
	accountMode: string;
	accountValue: string;
	availableFundsInSpot: string;
	crossAccountLeverage: string;
	crossMaintenanceMargin: string;
	loading: string;
	overview: string;
	perpsSpot: string;
	summaryDescription: string;
	transferBetweenPerpsAndSpot: string;
	unrealizedPnl: string;
}

export function useAccountOverviewLabels({
	accountMode,
	usesSharedQuoteBalance,
}: AccountOverviewLabelsInput): AccountOverviewLabels {
	const { t } = useLingui();
	const accountModeLabel =
		accountMode === "unified"
			? t`Unified Account`
			: accountMode === "portfolioMargin"
				? t`Portfolio Margin`
				: accountMode === "separate"
					? t`Separate Accounts`
					: t`Select mode`;

	return {
		accountMarginRatio: t`Account Margin Ratio`,
		accountMode: accountModeLabel,
		accountValue: usesSharedQuoteBalance ? t`Portfolio Value` : t`Account Value`,
		availableFundsInSpot: t`Available funds are in Spot`,
		crossAccountLeverage: t`Cross Account Leverage`,
		crossMaintenanceMargin: t`Cross Maintenance Margin`,
		loading: t`Loading...`,
		overview: t`Overview`,
		perpsSpot: t`Perps / Spot`,
		summaryDescription: t`Margin and account risk at a glance`,
		transferBetweenPerpsAndSpot: t`Transfer between Perps and Spot`,
		unrealizedPnl: t`Unrealized PNL`,
	};
}
