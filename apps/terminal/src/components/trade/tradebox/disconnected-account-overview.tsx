import { useLingui } from "@lingui/react/macro";
import { useId } from "react";
import { ACCOUNT_LABELS } from "@/config/account-labels";
import { useAccountModeLabels } from "@/hooks/trade/use-account-mode-labels";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { getDisconnectedAccountOverviewRows } from "@/lib/trade/account-overview-presentation";
import { AccountActionButtonView } from "./account-action-button-view";
import { AccountOverviewView } from "./account-overview-view";

interface Props {
	depositEnabled: boolean;
	depositDisabledReason?: string | null;
	onDeposit?: () => void;
}

export function DisconnectedAccountOverview({ depositEnabled, depositDisabledReason, onDeposit }: Props) {
	const numberFormatRevision = useNumberFormatRevision();
	const { t } = useLingui();
	const modes = useAccountModeLabels();
	const titleId = useId();
	const depositDescriptionId = `${titleId}-deposit`;
	const rows = getDisconnectedAccountOverviewRows(t, numberFormatRevision);

	return (
		<AccountOverviewView
			title={modes.unavailable.summary}
			titleId={titleId}
			rows={rows}
			deposit={
				<AccountActionButtonView
					variant="filled"
					label={t(ACCOUNT_LABELS.deposit)}
					disabled={!depositEnabled}
					focusableWhenDisabled
					aria-describedby={depositDisabledReason ? depositDescriptionId : undefined}
					onClick={depositEnabled ? onDeposit : undefined}
					title={depositDisabledReason ?? undefined}
				/>
			}
			withdraw={<AccountActionButtonView variant="outline" label={t(ACCOUNT_LABELS.withdraw)} disabled />}
			description={
				depositDisabledReason ? (
					<span id={depositDescriptionId} className="sr-only">
						{depositDisabledReason}
					</span>
				) : null
			}
		/>
	);
}
