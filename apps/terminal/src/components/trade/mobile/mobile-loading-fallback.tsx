import { Trans } from "@lingui/react/macro";
import { MobileShellSkeleton } from "../layout/app-shell-skeleton";

export function MobileLoadingFallback() {
	return (
		<div aria-busy="true" data-testid="mobile-loading-fallback">
			<output className="sr-only">
				<Trans>Loading markets...</Trans>
			</output>
			<MobileShellSkeleton />
		</div>
	);
}
