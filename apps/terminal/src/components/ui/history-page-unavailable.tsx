import { Trans } from "@lingui/react/macro";
import { Button } from "@sairn/ui";

interface Props {
	offline: boolean;
	refreshing: boolean;
	description: string;
	onRetry: () => void;
}

export function HistoryPageUnavailable({ offline, refreshing, description, onRetry }: Props) {
	const waiting = offline || refreshing;
	return (
		<div data-slot="history-page-unavailable" className="flex min-h-80 flex-col">
			<output aria-live="polite" className="sr-only">
				{description}
			</output>
			<div aria-busy={waiting} className="flex flex-1 flex-col items-center justify-center px-6 text-center">
				{waiting ? null : (
					<Button variant="outline" intent="neutral" onClick={onRetry}>
						<Trans>Retry</Trans>
					</Button>
				)}
			</div>
		</div>
	);
}
