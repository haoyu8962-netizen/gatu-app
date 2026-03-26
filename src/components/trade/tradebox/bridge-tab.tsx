import { Trans } from "@lingui/react/macro";
import { ArrowsLeftRightIcon, WalletIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useConnection } from "wagmi";
import { initLiFi } from "@/lib/lifi/config";

function BridgeWalletNotConnected() {
	return (
		<div className="flex flex-col items-center gap-4 py-8">
			<div className="flex size-12 items-center justify-center rounded-full bg-surface-analysis border border-border-200/40">
				<WalletIcon className="size-6 text-text-950" />
			</div>
			<div className="text-center space-y-1">
				<p className="text-sm font-medium">
					<Trans>Wallet not connected</Trans>
				</p>
				<p className="text-3xs text-text-950">
					<Trans>Connect your wallet to bridge funds</Trans>
				</p>
			</div>
		</div>
	);
}

function BridgePlaceholder() {
	return (
		<div className="flex flex-col items-center gap-4 py-8">
			<div className="flex size-12 items-center justify-center rounded-full bg-surface-analysis border border-border-200/40">
				<ArrowsLeftRightIcon className="size-6 text-text-950" />
			</div>
			<div className="text-center space-y-1">
				<p className="text-sm font-medium">
					<Trans>Bridge to Hyperliquid</Trans>
				</p>
				<p className="text-3xs text-text-950">
					<Trans>Deposit from any chain to your Hyperliquid account</Trans>
				</p>
			</div>
		</div>
	);
}

export function BridgeTab() {
	const { address } = useConnection();
	const lifiInitialized = useRef(false);

	useEffect(() => {
		if (!lifiInitialized.current) {
			initLiFi();
			lifiInitialized.current = true;
		}
	}, []);

	if (!address) {
		return <BridgeWalletNotConnected />;
	}

	return <BridgePlaceholder />;
}
