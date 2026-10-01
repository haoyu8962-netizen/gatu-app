import { useLingui } from "@lingui/react/macro";
import { Button } from "@sairn/ui";

interface Props {
	onRetry: () => void;
}

export function ApplicationErrorPage({ onRetry }: Props) {
	const { t } = useLingui();

	return (
		<main className="min-h-screen bg-background text-fg flex items-center justify-center p-6">
			<div className="text-center space-y-3" role="alert">
				<div className="space-y-1">
					<h1 className="text-sm font-semibold">{t`Something went wrong`}</h1>
					<p className="text-xs text-fg-muted">
						{t`The terminal could not continue safely. Reload it before trading.`}
					</p>
				</div>
				<Button type="button" variant="filled" intent="brand" size="sm" onClick={onRetry}>
					{t`Reload terminal`}
				</Button>
			</div>
		</main>
	);
}
