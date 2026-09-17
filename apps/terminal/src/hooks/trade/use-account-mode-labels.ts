import { useLingui } from "@lingui/react/macro";
import { ACCOUNT_LABELS } from "@/config/account-labels";

export function useAccountModeLabels() {
	const { t } = useLingui();
	return {
		unified: { name: t`Unified account`, short: t`Unified`, summary: t`Unified Account Summary` },
		portfolio: { name: t`Portfolio margin`, short: t`Portfolio`, summary: t`Portfolio Margin Summary` },
		manual: { name: t`Manual`, short: t`Manual`, summary: t`Manual Account Summary` },
		unavailable: {
			name: t(ACCOUNT_LABELS.account),
			short: t(ACCOUNT_LABELS.account),
			summary: t(ACCOUNT_LABELS.summary),
		},
	};
}
