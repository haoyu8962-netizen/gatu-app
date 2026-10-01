import { Trans, useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { AdaptiveModal, Button, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@sairn/ui";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientError } from "@/lib/error-reporting/client";
import { LazyComponentLoadError } from "@/lib/lazy";

export interface LazyDialogShellProps {
	onOpenChange: (open: boolean) => void;
	open: boolean;
	presentation: "drawer" | "modal";
}

export function LazyDialogLoadingFallback({ open, onOpenChange, presentation }: LazyDialogShellProps) {
	const { t } = useLingui();

	return (
		<AdaptiveModal
			closeLabel={t`Cancel`}
			open={open}
			onOpenChange={onOpenChange}
			presentation={presentation}
			showHandle={false}
			size="sm"
		>
			<ModalHeader className="sr-only">
				<ModalTitle>
					<Trans>Loading...</Trans>
				</ModalTitle>
			</ModalHeader>
			<ModalContent>
				<output
					className="flex min-h-24 items-center justify-center gap-2 text-sm text-fg"
					data-testid="lazy-dialog-loading-fallback"
					aria-busy="true"
					aria-live="polite"
				>
					<SpinnerGapIcon className="size-4 animate-spin text-fg-muted motion-reduce:animate-none" aria-hidden="true" />
					<Trans>Loading...</Trans>
				</output>
			</ModalContent>
		</AdaptiveModal>
	);
}

interface ErrorFallbackProps extends LazyDialogShellProps {
	onRetry: () => void;
}

function reloadPage() {
	window.location.reload();
}

function LazyDialogErrorFallback({ open, onOpenChange, onRetry, presentation }: ErrorFallbackProps) {
	const { t } = useLingui();

	return (
		<AdaptiveModal
			closeLabel={t`Close`}
			open={open}
			onOpenChange={onOpenChange}
			presentation={presentation}
			showHandle={false}
			size="sm"
		>
			<ModalHeader>
				<ModalTitle>
					<Trans>Something went wrong</Trans>
				</ModalTitle>
			</ModalHeader>
			<ModalContent>
				<p className="text-sm text-fg-muted">
					<Trans>
						This panel could not be loaded. Try again, or reload the page. Reloading clears an order you have not sent.
					</Trans>
				</p>
			</ModalContent>
			<ModalFooter>
				<Button type="button" variant="outline" intent="neutral" size="sm" onClick={reloadPage}>
					<Trans>Reload page</Trans>
				</Button>
				<Button type="button" variant="filled" intent="brand" size="sm" onClick={onRetry}>
					<Trans>Try again</Trans>
				</Button>
			</ModalFooter>
		</AdaptiveModal>
	);
}

interface BoundaryProps extends LazyDialogShellProps {
	children: ReactNode;
}

interface BoundaryState {
	loadError: LazyComponentLoadError | null;
}

export class LazyDialogErrorBoundary extends Component<BoundaryProps, BoundaryState> {
	override state: BoundaryState = { loadError: null };

	static getDerivedStateFromError(error: unknown): BoundaryState {
		if (!(error instanceof LazyComponentLoadError)) throw error;
		return { loadError: error };
	}

	override componentDidCatch(error: Error, info: ErrorInfo): void {
		reportClientError(error, {
			kind: "react_boundary",
			componentStack: info.componentStack ?? undefined,
		});
	}

	override componentDidUpdate(previous: BoundaryProps): void {
		if (this.state.loadError && !previous.open && this.props.open) this.retry();
	}

	retry = (): void => {
		this.state.loadError?.retry();
		this.setState({ loadError: null });
	};

	override render(): ReactNode {
		if (this.state.loadError) {
			return (
				<LazyDialogErrorFallback
					onOpenChange={this.props.onOpenChange}
					onRetry={this.retry}
					open={this.props.open}
					presentation={this.props.presentation}
				/>
			);
		}

		return this.props.children;
	}
}
