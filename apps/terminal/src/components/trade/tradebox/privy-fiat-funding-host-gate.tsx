import { useLingui } from "@lingui/react/macro";
import { type ComponentType, useEffect, useState } from "react";
import { toast } from "sonner";
import { getPrivyFiatFundingFeedback } from "@/lib/trade/privy-fiat-funding-feedback";
import { finishPrivyFiatFunding, usePrivyFiatFundingAttempt } from "@/stores/use-privy-fiat-funding-store";

export function PrivyFiatFundingHostGate() {
	const { t } = useLingui();
	const attempt = usePrivyFiatFundingAttempt();
	const [Host, setHost] = useState<ComponentType | null>(null);

	useEffect(() => {
		if (!attempt || Host) return;
		let cancelled = false;
		import("./privy-fiat-funding-host").then(
			(module) => {
				if (!cancelled) setHost(() => module.PrivyFiatFundingHost);
			},
			() => {
				if (cancelled) return;
				finishPrivyFiatFunding(attempt);
				const feedback = getPrivyFiatFundingFeedback("unavailable", attempt.destination.walletKind, (descriptor) =>
					t(descriptor),
				);
				if (feedback) toast.error(feedback.title);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [attempt, Host, t]);

	return Host ? <Host /> : null;
}
