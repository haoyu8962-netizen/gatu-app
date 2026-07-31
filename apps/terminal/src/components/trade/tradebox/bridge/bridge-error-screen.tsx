import { Button } from "@gatu/ui";
import { Trans } from "@lingui/react/macro";
import { WarningCircleIcon } from "@phosphor-icons/react";

const BRIDGE_MESSAGE_MAX_WIDTH = "max-w-70";

interface Props {
	error: string;
	onBack?: () => void;
	onRetry?: () => void;
	retryMode?: "retry" | "track";
}

export function BridgeErrorScreen({ error, onBack, onRetry, retryMode = "retry" }: Props) {
	return (
		<div className="flex flex-1 flex-col items-center">
			<div className="flex flex-1 flex-col items-center justify-center gap-4">
				<div className="flex size-12 items-center justify-center rounded-full bg-error-soft border border-stroke-error-strong/30">
					<WarningCircleIcon className="size-6 text-error" />
				</div>
				<div className="text-center space-y-1">
					<p className="text-sm font-medium text-fg">
						<Trans>Bridge failed</Trans>
					</p>
					<p className={`text-xs text-fg-muted ${BRIDGE_MESSAGE_MAX_WIDTH}`}>{error}</p>
				</div>
			</div>
			{onBack || onRetry ? (
				<div className="flex gap-2 w-full mt-auto">
					{onBack ? (
						<Button variant="outline" intent="neutral" size="lg" className="flex-1" onClick={onBack}>
							<Trans>Back</Trans>
						</Button>
					) : null}
					{onRetry ? (
						<Button variant="filled" intent="brand" size="lg" className="flex-1" onClick={onRetry}>
							{retryMode === "track" ? <Trans>Resume tracking</Trans> : <Trans>Try Again</Trans>}
						</Button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
