import { Trans } from "@lingui/react/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import type { LegalGateState } from "@/hooks/trade/use-legal-gate";

interface Props {
	state: LegalGateState;
}

export function LegalStatusNotice({ state }: Props) {
	if (state !== "checking") return null;

	return (
		<output
			data-slot="legal-status-notice"
			aria-live="polite"
			className="flex shrink-0 items-center gap-2 border-b border-stroke-weak/60 px-3 py-2 text-xs text-trading-panel-muted"
		>
			<SpinnerGapIcon aria-hidden="true" className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
			<Trans>Verifying trading access</Trans>
		</output>
	);
}
