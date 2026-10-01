import { Trans } from "@lingui/react/macro";
import { WarningCircleIcon, WifiSlashIcon } from "@phosphor-icons/react";
import { Button } from "@sairn/ui";

interface Props {
	isPaused: boolean;
	onRetry: () => void;
}

export function TerminalBootError({ isPaused, onRetry }: Props) {
	return (
		<main
			data-testid="terminal-boot-error"
			role="alert"
			className="grid min-h-dvh place-items-center bg-background px-5 py-12 text-center text-fg"
		>
			<div className="flex max-w-sm flex-col items-center gap-3">
				<span className="grid size-11 place-items-center rounded-full bg-error-soft text-error">
					{isPaused ? <WifiSlashIcon className="size-6" /> : <WarningCircleIcon className="size-6" weight="fill" />}
				</span>
				<div>
					<h1 className="text-sm font-bold">
						{isPaused ? <Trans>You're offline</Trans> : <Trans>Something went wrong</Trans>}
					</h1>
					<p className="mt-1 text-xs leading-5 text-fg-muted">
						<Trans>Connection could not be established.</Trans>
					</p>
				</div>
				<Button type="button" size="md" disabled={isPaused} onClick={onRetry}>
					<Trans>Retry</Trans>
				</Button>
			</div>
		</main>
	);
}
