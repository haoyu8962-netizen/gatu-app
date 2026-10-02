import { useLingui } from "@lingui/react/macro";
import { useFiatOnramp } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusGlyph } from "@/components/brand/status-glyph";
import { FUNDS_OUTCOME_TOAST_DURATION_MS } from "@/config/time";
import {
	classifyPrivyFiatFundingError,
	classifyPrivyFiatFundingResult,
	createPrivyFiatFundingRequest,
	type PrivyFiatFundingOutcome,
	type PrivyFiatFundingWalletKind,
} from "@/domain/trade/privy-fiat-funding";
import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding-owner-key";
import { STATUS_GLYPH_UNKNOWN } from "@/lib/brand/status-glyph.gen";
import { useHyperliquid } from "@/lib/hyperliquid";
import { getPrivyFiatFundingFeedback } from "@/lib/trade/privy-fiat-funding-feedback";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import {
	finishPrivyFiatFunding,
	type PrivyFiatFundingAttempt,
	usePrivyFiatFundingAttempt,
} from "@/stores/use-privy-fiat-funding-store";

interface FundingNotice {
	ownerKey: string;
	outcome: PrivyFiatFundingOutcome;
	walletKind: PrivyFiatFundingWalletKind;
}

interface NoticePresentation {
	id: string | null;
	locale: string;
}

let presentationSequence = 0;

export function PrivyFiatFundingHost() {
	const { t, i18n } = useLingui();
	const { fund } = useFiatOnramp();
	const { clientKey } = useHyperliquid();
	const isTestnet = useIsTestnet();
	const attempt = usePrivyFiatFundingAttempt();
	const ownerKey = getPrivyFiatFundingOwnerKey(isTestnet ? "testnet" : "mainnet", clientKey);
	const ownerKeyRef = useRef(ownerKey);
	const startedAttemptRef = useRef<PrivyFiatFundingAttempt | null>(null);
	const [notices, setNotices] = useState<readonly FundingNotice[]>([]);
	const presentationsRef = useRef(new Map<FundingNotice, NoticePresentation>());

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
			const notice = { ownerKey: current.ownerKey, outcome, walletKind: current.destination.walletKind };
			setNotices((shown) => [...shown, notice]);
		}

		new Promise((resolve) => resolve(fund(createPrivyFiatFundingRequest(current.destination, current.network)))).then(
			(result) => settle(classifyPrivyFiatFundingResult(result)),
			(error: unknown) => settle(classifyPrivyFiatFundingError(error)),
		);
	}, [attempt, fund]);

	useEffect(() => {
		const presentations = presentationsRef.current;
		for (const notice of notices) {
			const presentation = presentations.get(notice) ?? { id: null, locale: "" };
			presentations.set(notice, presentation);
			if (notice.ownerKey !== ownerKey) {
				const hiddenId = presentation.id;
				presentation.id = null;
				if (hiddenId) toast.dismiss(hiddenId);
				continue;
			}
			if (presentation.id && presentation.locale === i18n.locale) continue;
			const feedback = getPrivyFiatFundingFeedback(notice.outcome, notice.walletKind, (descriptor) => t(descriptor));
			if (!feedback) continue;
			const id = presentation.id ?? `privy-fiat-funding:${++presentationSequence}`;
			presentation.id = id;
			presentation.locale = i18n.locale;
			function close() {
				if (presentation.id !== id) return;
				presentations.delete(notice);
				setNotices((shown) => shown.filter((item) => item !== notice));
			}
			const options = {
				id,
				onDismiss: close,
				onAutoClose: close,
				description:
					feedback.descriptionLines.length > 0 ? (
						<span className="flex flex-col gap-1">
							{feedback.descriptionLines.map((line) => (
								<span key={line}>{line}</span>
							))}
						</span>
					) : undefined,
				duration: feedback.persistent ? Number.POSITIVE_INFINITY : FUNDS_OUTCOME_TOAST_DURATION_MS,
				closeButton: feedback.persistent,
			};
			if (feedback.tone === "success") toast.success(feedback.title, options);
			else if (feedback.tone === "uncertain")
				toast.warning(feedback.title, { ...options, icon: <StatusGlyph glyph={STATUS_GLYPH_UNKNOWN} /> });
			else if (feedback.tone === "warning") toast.warning(feedback.title, options);
			else toast.error(feedback.title, options);
		}
	}, [i18n.locale, notices, ownerKey, t]);

	return null;
}
