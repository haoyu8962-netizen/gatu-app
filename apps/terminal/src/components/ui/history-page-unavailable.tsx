import { Trans } from "@lingui/react/macro";
import { Button } from "@sairn/ui";

interface Props {
	offline: boolean;
	description: string;
	onRetry: () => void;
}

export function HistoryPageUnavailable({ offline, description, onRetry }: Props) {
	return (
		<div
			data-slot="history-page-unavailable"
			aria-busy={offline}
			className="flex min-h-80 flex-col items-center justify-center px-6 text-center"
		>
			<output aria-live="polite" className="sr-only">
				{description}
			</output>
			{offline ? null : (
				<Button variant="outline" intent="neutral" onClick={onRetry}>
					<Trans>Retry</Trans>
				</Button>
			)}
		</div>
	);
}
