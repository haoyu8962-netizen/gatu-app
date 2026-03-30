import { t } from "@lingui/core/macro";
import { WarningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useGlobalSettingsActions, useIsTestnet } from "@/stores/use-global-settings-store";

export function TestnetBanner() {
	const isTestnet = useIsTestnet();
	const { setNetwork } = useGlobalSettingsActions();

	if (!isTestnet) return null;

	return (
		<div className="fixed top-0 left-0 right-0 z-50 h-8 bg-warning-700 text-text-10 flex items-center justify-center gap-2 text-xs font-medium">
			<WarningIcon className="size-3.5" />
			<span>{t`You are on Testnet`}</span>
			<Button
				variant="outlined"
				onClick={() => setNetwork("mainnet")}
				className="h-5 px-2 text-3xs font-medium rounded-xs bg-transparent border border-text-10/40 text-text-10 hover:bg-text-10/10 transition-colors"
			>
				{t`Switch to Mainnet`}
			</Button>
		</div>
	);
}
