import { AdaptiveModal, Button, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientError } from "@/lib/error-reporting/client";
import { UserMenuModalLoadError } from "./user-menu-modal-load";

interface ModalShellProps {
	onOpenChange: (open: boolean) => void;
	open: boolean;
	presentation: "drawer" | "modal";
}

interface LoadingFallbackProps extends ModalShellProps {
	title?: ReactNode;
	label?: ReactNode;
}

export function UserMenuModalLoadingFallback({ open, onOpenChange, presentation, title, label }: LoadingFallbackProps) {
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
				<ModalTitle>{title ?? <Trans>Connecting...</Trans>}</ModalTitle>
			</ModalHeader>
			<ModalContent>
				<output
					className="flex min-h-24 items-center justify-center gap-2 text-sm text-fg"
					data-testid="user-menu-modal-loading-fallback"
					aria-busy="true"
					aria-live="polite"
				>
					<SpinnerGapIcon className="size-4 animate-spin text-fg-muted motion-reduce:animate-none" aria-hidden="true" />
					{label ?? <Trans>Connecting...</Trans>}
				</output>
			</ModalContent>
		</AdaptiveModal>
	);
}

interface ErrorFallbackProps extends ModalShellProps {
	onRetry: () => void;
}

function UserMenuModalErrorFallback({ open, onOpenChange, onRetry, presentation }: ErrorFallbackProps) {
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
			<ModalFooter>
				<Button type="button" variant="filled" intent="brand" size="sm" onClick={onRetry}>
					<Trans>Try again</Trans>
				</Button>
			</ModalFooter>
		</AdaptiveModal>
	);
}

interface BoundaryProps extends ErrorFallbackProps {
	children: ReactNode;
}

interface BoundaryState {
	hasError: boolean;
}

export class UserMenuModalErrorBoundary extends Component<BoundaryProps, BoundaryState> {
	override state: BoundaryState = { hasError: false };

	static getDerivedStateFromError(error: unknown): BoundaryState {
		if (!(error instanceof UserMenuModalLoadError)) throw error;
		return { hasError: true };
	}

	override componentDidCatch(error: Error, info: ErrorInfo): void {
		reportClientError(error, {
			kind: "react_boundary",
			componentStack: info.componentStack ?? undefined,
		});
	}

	override render(): ReactNode {
		if (this.state.hasError) {
			return (
				<UserMenuModalErrorFallback
					onOpenChange={this.props.onOpenChange}
					onRetry={this.props.onRetry}
					open={this.props.open}
					presentation={this.props.presentation}
				/>
			);
		}

		return this.props.children;
	}
}
