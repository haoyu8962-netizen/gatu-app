import { invalidateAllExchangeRequestIdentities } from "@gatu/hl-react/internal/exchange/request-scheduler";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { ApplicationErrorPage } from "@/components/pages/application-error-page";
import { reportClientError } from "@/lib/error-reporting/client";

interface Props {
	children: ReactNode;
}

interface State {
	hasError: boolean;
}

export class ApplicationErrorBoundary extends Component<Props, State> {
	override state: State = { hasError: false };

	static getDerivedStateFromError(): State {
		return { hasError: true };
	}

	override componentDidCatch(error: Error, info: ErrorInfo): void {
		invalidateAllExchangeRequestIdentities();
		reportClientError(error, {
			kind: "react_boundary",
			componentStack: info.componentStack ?? undefined,
		});
	}

	override render(): ReactNode {
		if (this.state.hasError) {
			return <ApplicationErrorPage onRetry={() => window.location.reload()} />;
		}
		return this.props.children;
	}
}
