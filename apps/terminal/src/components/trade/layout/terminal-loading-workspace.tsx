import { Trans, useLingui } from "@lingui/react/macro";
import { type PanelFrameLabels, renderDesktopPanelFrame } from "./app-shell-skeleton";
import { type DesktopGridLoadingPanelId, DesktopGridLoadingSurface } from "./desktop-grid-loading-surface";

function useTranslatedPanelFrameLabels(): PanelFrameLabels {
	const { t } = useLingui();
	return {
		marketStats: [t`Mark`, t`ORACLE`, t`24h Change`, t`24H VOL`, t`OPEN INT`, t`FUNDING`],
		orderBook: t`Order Book`,
		trades: t`Trades`,
		price: t`Price`,
		size: t`Size`,
		total: t`Total`,
		spread: t`Spread`,
		orderControls: [
			[t`Margin`, t`Cross`],
			[t`Leverage`, "—"],
			[t`Account`, t`Account`],
		],
		orderTypeTabs: [t`Market`, t`Limit`, t`Advanced`],
		long: t`Long`,
		short: t`Short`,
		available: t`Available`,
		orderOptions: [t`Reduce Only`, t`TP/SL`],
		connectWallet: t`Connect Wallet`,
		orderSummaryRows: [t`Liq. Price`, t`Order Value`, t`Margin Req.`, t`Est. Slippage`, t`Slippage`, t`Fees`],
		accountTabs: [
			t`Balances`,
			t`Positions`,
			t`Open Orders`,
			t`TWAP`,
			t`Trade History`,
			t`Funding Payments`,
			t`Order History`,
		],
		deposit: t`Deposit`,
		withdraw: t`Withdraw`,
		accountSummary: t`Account Summary`,
		accountSummaryRows: [t`Account Margin Ratio`, t`Portfolio Value`, t`Cross Account Leverage`],
	};
}

export function TerminalLoadingWorkspace() {
	const labels = useTranslatedPanelFrameLabels();
	function renderPanel(panelId: DesktopGridLoadingPanelId) {
		return renderDesktopPanelFrame(panelId, labels);
	}
	return (
		<main
			aria-busy="true"
			data-terminal-loading-workspace
			data-testid="terminal-loading-workspace"
			className="min-h-0 flex-1 overflow-hidden bg-grid-container"
		>
			<output className="sr-only">
				<Trans>Loading markets...</Trans>
			</output>
			<DesktopGridLoadingSurface
				panelClassName="desktop-grid-panel overflow-hidden bg-surface"
				renderPanel={renderPanel}
			/>
		</main>
	);
}
