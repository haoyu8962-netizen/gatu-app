import { Trans } from "@lingui/react/macro";
import { renderDesktopPanelFrame } from "./app-shell-skeleton";
import { DesktopGridLoadingSurface } from "./desktop-grid-loading-surface";

export function TerminalLoadingWorkspace() {
	return (
		<main
			aria-busy="true"
			data-terminal-loading-workspace
			data-testid="terminal-loading-workspace"
			className="min-h-0 flex-1 overflow-hidden bg-grid-container"
		>
			<output className="sr-only">
				<Trans>Loading markets...</Trans>
			</output>
			<DesktopGridLoadingSurface
				panelClassName="desktop-grid-panel overflow-hidden bg-surface"
				renderPanel={renderDesktopPanelFrame}
			/>
		</main>
	);
}
