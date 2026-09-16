import { Trans, useLingui } from "@lingui/react/macro";
import { MOBILE_NAV_ITEMS } from "@/config/nav";
import { MOBILE_POSITIONS_TABS } from "@/config/trade";
import { useMobileActiveTab, usePositionsActiveTab } from "@/stores/use-global-settings-store";
import { type MobilePanelFrameLabels, MobileShellSkeleton } from "../layout/app-shell-skeleton";

function useTranslatedMobilePanelFrameLabels(): MobilePanelFrameLabels {
	const { t, i18n } = useLingui();
	return {
		connectWallet: t`Connect Wallet`,
		long: t`Long`,
		short: t`Short`,
		available: t`Available`,
		size: t`Size`,
		price: t`Price`,
		orderOptions: [t`Reduce Only`, t`TP/SL`],
		orderSummaryRows: [t`Liq. Price`, t`Order Value`, t`Margin Req.`, t`Slippage`, t`Est. Fee`],
		accountTabs: MOBILE_POSITIONS_TABS.map((tab) => i18n._(tab.label)),
		nav: MOBILE_NAV_ITEMS.map((item) => i18n._(item.label)),
	};
}

export function MobileLoadingFallback() {
	const labels = useTranslatedMobilePanelFrameLabels();
	const positionsActiveTab = usePositionsActiveTab();
	const mobileActiveTab = useMobileActiveTab();
	const activePositionsTab =
		MOBILE_POSITIONS_TABS.find((tab) => tab.value === positionsActiveTab)?.value ?? "positions";
	const activeNavTab = MOBILE_NAV_ITEMS.find((item) => item.id === mobileActiveTab)?.id ?? "trade";
	return (
		<div aria-busy="true" data-testid="mobile-loading-fallback">
			<output className="sr-only">
				<Trans>Loading markets...</Trans>
			</output>
			<MobileShellSkeleton labels={labels} activePositionsTab={activePositionsTab} activeNavTab={activeNavTab} />
		</div>
	);
}
