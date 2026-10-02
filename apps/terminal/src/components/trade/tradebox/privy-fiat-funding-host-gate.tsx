import { useLingui } from "@lingui/react/macro";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding-owner-key";
import { useHyperliquid } from "@/lib/hyperliquid";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import {
	finishPrivyFiatFunding,
	forgetPrivyFiatFundingHostWarmUp,
	readPrivyFiatFundingAttempt,
	usePrivyFiatFundingHostWanted,
} from "@/stores/use-privy-fiat-funding-store";

export function PrivyFiatFundingHostGate() {
	const { t } = useLingui();
	const { clientKey } = useHyperliquid();
	const isTestnet = useIsTestnet();
	const hostWanted = usePrivyFiatFundingHostWanted();
	const [Host, setHost] = useState<ComponentType | null>(null);
	const ownerKey = getPrivyFiatFundingOwnerKey(isTestnet ? "testnet" : "mainnet", clientKey);
	const ownerKeyRef = useRef(ownerKey);

	useEffect(() => {
		ownerKeyRef.current = ownerKey;
	}, [ownerKey]);

	useEffect(() => {
		if (!hostWanted || Host) return;
		let cancelled = false;
		import("./privy-fiat-funding-host").then(
			(module) => {
				if (!cancelled) setHost(() => module.PrivyFiatFundingHost);
			},
			() => {
				if (cancelled) return;
				forgetPrivyFiatFundingHostWarmUp();
				const attempt = readPrivyFiatFundingAttempt();
				if (!attempt) return;
				finishPrivyFiatFunding(attempt);
				if (attempt.ownerKey !== ownerKeyRef.current) return;
				toast.error(t`Card purchase could not open. Check your connection and try again.`);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [hostWanted, Host, t]);

	return Host ? <Host /> : null;
}
