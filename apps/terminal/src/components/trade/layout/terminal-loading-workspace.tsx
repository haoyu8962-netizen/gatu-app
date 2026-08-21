import { Trans } from "@lingui/react/macro";
import { DesktopGridLoadingSurface } from "./desktop-grid-loading-surface";

export function TerminalLoadingWorkspace() {
	return (
		<div
			aria-busy="true"
			data-terminal-loading-workspace
			data-testid="terminal-loading-workspace"
			className="min-h-0 flex-1 overflow-hidden bg-grid-container"
		>
			<output className="sr-only">
				<Trans>Loading markets...</Trans>
			</output>
			<DesktopGridLoadingSurface panelClassName="desktop-grid-panel bg-surface" />
		</div>
	);
}
