import { Button } from "@hypeterminal/ui";
import { Trans } from "@lingui/react/macro";
import { WarningCircleIcon } from "@phosphor-icons/react";

const BRIDGE_MESSAGE_MAX_WIDTH = "max-w-70";

interface Props {
	error: string;
	onBack: () => void;
	onRetry: () => void;
}

export function BridgeErrorScreen({ error, onBack, onRetry }: Props) {
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
			<div className="flex gap-2 w-full mt-auto">
				<Button variant="outline" intent="neutral" size="lg" className="flex-1" onClick={onBack}>
					<Trans>Back</Trans>
				</Button>
				<Button variant="filled" intent="brand" size="lg" className="flex-1" onClick={onRetry}>
					<Trans>Try Again</Trans>
				</Button>
			</div>
		</div>
	);
}
