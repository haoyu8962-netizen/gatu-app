import { useLingui } from "@lingui/react/macro";
import { useFiatOnramp } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { StatusGlyph } from "@/components/brand/status-glyph";
import { FUNDS_OUTCOME_TOAST_DURATION_MS } from "@/config/time";
import {
	classifyPrivyFiatFundingError,
	classifyPrivyFiatFundingResult,
	createPrivyFiatFundingRequest,
	getPrivyFiatFundingOwnerKey,
	type PrivyFiatFundingOutcome,
} from "@/domain/trade/privy-fiat-funding";
import { STATUS_GLYPH_UNKNOWN } from "@/lib/brand/status-glyph.gen";
import { useHyperliquid } from "@/lib/hyperliquid";
import { getPrivyFiatFundingFeedback } from "@/lib/trade/privy-fiat-funding-feedback";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import {
	finishPrivyFiatFunding,
	type PrivyFiatFundingAttempt,
	usePrivyFiatFundingAttempt,
} from "@/stores/use-privy-fiat-funding-store";

export function PrivyFiatFundingHost() {
	const { t } = useLingui();
	const { fund } = useFiatOnramp();
	const { clientKey } = useHyperliquid();
	const isTestnet = useIsTestnet();
	const attempt = usePrivyFiatFundingAttempt();
	const ownerKey = getPrivyFiatFundingOwnerKey(isTestnet ? "testnet" : "mainnet", clientKey);
	const ownerKeyRef = useRef(ownerKey);
	const startedAttemptRef = useRef<PrivyFiatFundingAttempt | null>(null);

	useEffect(() => {
		ownerKeyRef.current = ownerKey;
	}, [ownerKey]);

	useEffect(() => {
		if (!attempt || startedAttemptRef.current === attempt) return;
		const current: PrivyFiatFundingAttempt = attempt;
		startedAttemptRef.current = current;

		function settle(outcome: PrivyFiatFundingOutcome) {
			finishPrivyFiatFunding(current);
			if (ownerKeyRef.current !== current.ownerKey) return;
			const feedback = getPrivyFiatFundingFeedback(outcome, current.destination.walletKind, (descriptor) =>
				t(descriptor),
			);
			if (!feedback) return;
			const options = { description: feedback.description ?? undefined, duration: FUNDS_OUTCOME_TOAST_DURATION_MS };
			if (feedback.tone === "success") toast.success(feedback.title, options);
			else if (feedback.tone === "uncertain")
				toast.warning(feedback.title, { ...options, icon: <StatusGlyph glyph={STATUS_GLYPH_UNKNOWN} /> });
			else if (feedback.tone === "warning") toast.warning(feedback.title, options);
			else toast.error(feedback.title, options);
		}

		fund(createPrivyFiatFundingRequest(current.destination, current.network)).then(
			(result) => settle(classifyPrivyFiatFundingResult(result)),
			(error: unknown) => settle(classifyPrivyFiatFundingError(error)),
		);
	}, [attempt, fund, t]);

	return null;
}
