import { useFiatOnramp } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";
import {
	classifyPrivyFiatFundingError,
	classifyPrivyFiatFundingResult,
	createPrivyFiatFundingRequest,
	type PrivyFiatFundingOutcome,
} from "@/domain/trade/privy-fiat-funding";
import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding-owner-key";
import { useHyperliquid } from "@/lib/hyperliquid";
import type { PrivyFiatFundingNotice } from "@/lib/trade/privy-fiat-funding-feedback";
import type { PrivyFiatFundingNoticePresentation } from "@/lib/trade/privy-fiat-funding-notice-presentation";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import {
	finishPrivyFiatFunding,
	type PrivyFiatFundingAttempt,
	usePrivyFiatFundingAttempt,
} from "@/stores/use-privy-fiat-funding-store";
import { retractPrivyFiatFundingNotice, showPrivyFiatFundingNotice } from "./privy-fiat-funding-notice-toast";

export function PrivyFiatFundingHost() {
	const { fund } = useFiatOnramp();
	const { clientKey } = useHyperliquid();
	const isTestnet = useIsTestnet();
	const attempt = usePrivyFiatFundingAttempt();
	const ownerKey = getPrivyFiatFundingOwnerKey(isTestnet ? "testnet" : "mainnet", clientKey);
	const ownerKeyRef = useRef(ownerKey);
	const startedAttemptRef = useRef<PrivyFiatFundingAttempt | null>(null);
	const [notices, setNotices] = useState<readonly PrivyFiatFundingNotice[]>([]);
	const displayedRef = useRef(new Map<PrivyFiatFundingNotice, PrivyFiatFundingNoticePresentation>());

	useEffect(() => {
		ownerKeyRef.current = ownerKey;
	}, [ownerKey]);

	useEffect(() => {
		if (!attempt || startedAttemptRef.current === attempt) return;
		const current: PrivyFiatFundingAttempt = attempt;
		startedAttemptRef.current = current;
		if (ownerKeyRef.current !== current.ownerKey) {
			finishPrivyFiatFunding(current);
			return;
		}

		function settle(outcome: PrivyFiatFundingOutcome) {
			finishPrivyFiatFunding(current);
			if (outcome === "cancelled") return;
			const notice: PrivyFiatFundingNotice = {
				kind: outcome,
				network: current.network,
				ownerKey: current.ownerKey,
				walletKind: current.destination.walletKind,
			};
			setNotices((kept) => [...kept, notice]);
		}

		new Promise((resolve) => resolve(fund(createPrivyFiatFundingRequest(current.destination, current.network)))).then(
			(result) => settle(classifyPrivyFiatFundingResult(result)),
			(error: unknown) => settle(classifyPrivyFiatFundingError(error)),
		);
	}, [attempt, fund]);

	useEffect(() => {
		const displayed = displayedRef.current;
		for (const [notice, presentation] of displayed) {
			if (notice.ownerKey === ownerKey) continue;
			displayed.delete(notice);
			retractPrivyFiatFundingNotice(presentation);
		}
		for (const notice of notices) {
			if (notice.ownerKey !== ownerKey || displayed.has(notice)) continue;
			displayed.set(
				notice,
				showPrivyFiatFundingNotice(notice, () => {
					displayed.delete(notice);
					setNotices((kept) => kept.filter((item) => item !== notice));
				}),
			);
		}
	}, [notices, ownerKey]);

	useEffect(() => {
		const displayed = displayedRef.current;
		return () => {
			const presentations = [...displayed.values()];
			displayed.clear();
			for (const presentation of presentations) retractPrivyFiatFundingNotice(presentation);
		};
	}, []);

	return null;
}
