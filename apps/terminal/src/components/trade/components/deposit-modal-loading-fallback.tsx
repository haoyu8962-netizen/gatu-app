import { Trans } from "@lingui/react/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";

/**
 * The body of the deposit dialog while its chunk loads. `DepositModalHost` renders it inside the
 * one shell instance that later shows the loaded form, so the dialog chrome never remounts.
 */
export function DepositModalLoadingFallback() {
	return (
		<output
			className="flex min-h-72 items-center justify-center"
			data-testid="deposit-modal-loading-fallback"
			aria-busy="true"
		>
			<span className="sr-only">
				<Trans>Loading...</Trans>
			</span>
			<SpinnerGapIcon className="size-5 animate-spin text-fg-muted motion-reduce:animate-none" aria-hidden="true" />
		</output>
	);
}
