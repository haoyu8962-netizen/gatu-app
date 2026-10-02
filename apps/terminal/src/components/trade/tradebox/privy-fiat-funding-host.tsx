import { useFiatOnramp, useModalStatus } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import {
	classifyPrivyFiatFundingError,
	classifyPrivyFiatFundingResult,
	createPrivyFiatFundingRequest,
	isSamePrivyFiatFundingDestination,
} from "@/domain/trade/privy-fiat-funding";
import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding-owner-key";
import { usePrivyFiatFundingDestination } from "@/hooks/trade/use-privy-fiat-funding-destination";
import { useHyperliquid } from "@/lib/hyperliquid";
import type { PrivyFiatFundingNotice, PrivyFiatFundingNoticeKind } from "@/lib/trade/privy-fiat-funding-feedback";
import type { PrivyFiatFundingNoticePresentation } from "@/lib/trade/privy-fiat-funding-notice-presentation";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import {
	addPrivyFiatFundingNotice,
	finishPrivyFiatFunding,
	type PrivyFiatFundingAttempt,
	removePrivyFiatFundingNotice,
	startPrivyFiatFunding,
	usePrivyFiatFundingAttempt,
	usePrivyFiatFundingNotices,
} from "@/stores/use-privy-fiat-funding-store";
import { retractPrivyFiatFundingNotice, showPrivyFiatFundingNotice } from "./privy-fiat-funding-notice-toast";

export function PrivyFiatFundingHost() {
	const { fund } = useFiatOnramp();
	const { isOpen: privyWindowOpen } = useModalStatus();
	const { clientKey } = useHyperliquid();
	const isTestnet = useIsTestnet();
	const destination = usePrivyFiatFundingDestination();
	const attempt = usePrivyFiatFundingAttempt();
	const notices = usePrivyFiatFundingNotices();
	const ownerKey = getPrivyFiatFundingOwnerKey(isTestnet ? "testnet" : "mainnet", clientKey);
	const sessionRef = useRef({ destination, ownerKey });
	const windowSeenRef = useRef<PrivyFiatFundingAttempt | null>(null);
	const displayedRef = useRef(new Map<PrivyFiatFundingNotice, PrivyFiatFundingNoticePresentation>());

	useEffect(() => {
		sessionRef.current = { destination, ownerKey };
	}, [destination, ownerKey]);

	useEffect(() => {
		if (!attempt || !startPrivyFiatFunding(attempt)) return;
		const current: PrivyFiatFundingAttempt = attempt;
		const session = sessionRef.current;

		function report(kind: PrivyFiatFundingNoticeKind | "cancelled") {
			finishPrivyFiatFunding(current);
			if (kind === "cancelled") return;
			addPrivyFiatFundingNotice({
				kind,
				network: current.network,
				ownerKey: current.ownerKey,
				walletKind: current.destination.walletKind,
			});
		}

		if (session.ownerKey !== current.ownerKey) {
			finishPrivyFiatFunding(current);
			return;
		}
		if (!isSamePrivyFiatFundingDestination(session.destination, current.destination)) {
			report("wallet-changed");
			return;
		}
		new Promise((resolve) => resolve(fund(createPrivyFiatFundingRequest(current.destination, current.network)))).then(
			(result) => report(classifyPrivyFiatFundingResult(result)),
			(error: unknown) => report(classifyPrivyFiatFundingError(error)),
		);
	}, [attempt, fund]);

	useEffect(() => {
		if (!attempt) return;
		if (privyWindowOpen) {
			windowSeenRef.current = attempt;
			return;
		}
		if (windowSeenRef.current === attempt) finishPrivyFiatFunding(attempt);
	}, [attempt, privyWindowOpen]);

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
					removePrivyFiatFundingNotice(notice);
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
