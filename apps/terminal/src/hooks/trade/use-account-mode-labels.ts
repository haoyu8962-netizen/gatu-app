import { useLingui } from "@lingui/react/macro";

export function useAccountModeLabels() {
	const { t } = useLingui();
	return {
		unified: { name: t`Unified account`, short: t`Unified`, summary: t`Unified Account Summary` },
		portfolio: { name: t`Portfolio margin`, short: t`Portfolio`, summary: t`Portfolio Margin Summary` },
		manual: { name: t`Manual`, short: t`Manual`, summary: t`Manual Account Summary` },
		unavailable: { name: t`Account`, short: t`Account`, summary: t`Account Summary` },
	};
}
