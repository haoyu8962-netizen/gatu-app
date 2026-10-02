import { useLingui } from "@lingui/react/macro";
import { type ComponentType, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	finishPrivyFiatFunding,
	forgetPrivyFiatFundingHostWarmUp,
	readPrivyFiatFundingAttempt,
	usePrivyFiatFundingHostWanted,
} from "@/stores/use-privy-fiat-funding-store";

export function PrivyFiatFundingHostGate() {
	const { t } = useLingui();
	const hostWanted = usePrivyFiatFundingHostWanted();
	const [Host, setHost] = useState<ComponentType | null>(null);

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
				toast.error(t`Card purchase could not open. Check your connection and try again.`);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [hostWanted, Host, t]);

	return Host ? <Host /> : null;
}
