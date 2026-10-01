import { useLingui } from "@lingui/react/macro";
import { Button } from "@sairn/ui";
import { Component, type ErrorInfo, type ReactNode, Suspense } from "react";
import { reportClientError } from "@/lib/error-reporting/client";
import { LazyComponentLoadError } from "@/lib/lazy";

interface Props {
	children: ReactNode;
}

export function FundingHistoryLoadBoundary({ children }: Props) {
	return (
		<FundingHistoryLoadErrorBoundary>
			<Suspense fallback={<FundingHistoryLoadingFallback />}>{children}</Suspense>
		</FundingHistoryLoadErrorBoundary>
	);
}

function FundingHistoryLoadingFallback() {
	const { t } = useLingui();

	return (
		<div aria-busy="true" data-funding-history-loading className="h-full w-full bg-surface">
			<span className="sr-only">{t`Loading...`}</span>
		</div>
	);
}

function FundingHistoryLoadRetry({ onRetry }: { onRetry: () => void }) {
	const { t } = useLingui();

	return (
		<div data-funding-history-load-error className="grid h-full w-full place-items-center bg-surface">
			<Button type="button" variant="outline" intent="neutral" size="xs" onClick={onRetry}>
				{t`Retry`}
			</Button>
		</div>
	);
}

interface BoundaryState {
	loadError: LazyComponentLoadError | null;
}

class FundingHistoryLoadErrorBoundary extends Component<Props, BoundaryState> {
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

	retry = (): void => {
		this.state.loadError?.retry();
		this.setState({ loadError: null });
	};

	override render(): ReactNode {
		if (this.state.loadError) return <FundingHistoryLoadRetry onRetry={this.retry} />;
		return this.props.children;
	}
}
