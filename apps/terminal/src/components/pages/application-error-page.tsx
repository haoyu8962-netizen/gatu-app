import { Button } from "@gatu/ui";

interface Props {
	onRetry: () => void;
}

export function ApplicationErrorPage({ onRetry }: Props) {
	return (
		<div className="min-h-screen bg-background text-fg flex items-center justify-center p-6" role="alert">
			<div className="text-center space-y-3">
				<div className="space-y-1">
					<h1 className="text-sm font-semibold">Something went wrong</h1>
					<p className="text-xs text-fg-muted">The terminal could not continue safely. Reload it before trading.</p>
				</div>
				<Button type="button" variant="filled" intent="brand" size="sm" onClick={onRetry}>
					Reload terminal
				</Button>
			</div>
		</div>
	);
}
