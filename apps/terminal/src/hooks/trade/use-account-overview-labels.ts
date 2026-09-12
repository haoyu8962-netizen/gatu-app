import { useLingui } from "@lingui/react/macro";
import type { AccountOverviewMode } from "@/domain/trade/account-overview";
import { useAccountModeLabels } from "./use-account-mode-labels";

interface AccountOverviewLabelsInput {
	accountMode: AccountOverviewMode;
	usesSharedQuoteBalance: boolean;
}

interface AccountOverviewLabels {
	accountMarginRatio: string;
	accountMode: string;
	accountValue: string;
	accountLeverage: string;
	maintenanceMargin: string;
	loading: string;
	summary: string;
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
	const modes = useAccountModeLabels();
	const labels =
		accountMode === "unified"
			? modes.unified
			: accountMode === "portfolioMargin"
				? modes.portfolio
				: accountMode === "separate"
					? modes.manual
					: modes.unavailable;

	return {
		accountMarginRatio:
			accountMode === "unified"
				? t`Unified Account Ratio`
				: accountMode === "portfolioMargin"
					? t`Portfolio Margin Ratio`
					: t`Account Margin Ratio`,
		accountMode: labels.name,
		accountValue: usesSharedQuoteBalance ? t`Portfolio Value` : t`Account Value`,
		accountLeverage:
			accountMode === "unified"
				? t`Unified Account Leverage`
				: accountMode === "portfolioMargin"
					? t`Portfolio Account Leverage`
					: t`Cross Account Leverage`,
		maintenanceMargin: usesSharedQuoteBalance ? t`Perps Maintenance Margin` : t`Cross Maintenance Margin`,
		loading: t`Loading...`,
		summary: labels.summary,
		perpsSpot: t`Perps / Spot`,
		summaryDescription: t`Margin and account risk at a glance`,
		transferBetweenPerpsAndSpot: t`Transfer between Perps and Spot`,
		unrealizedPnl: t`Unrealized PNL`,
	};
}
