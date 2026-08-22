import { invalidateAllExchangeRequestIdentities } from "@gatu/hl-react/internal/exchange/request-scheduler";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { useLayoutEffect } from "react";
import { ApplicationErrorPage } from "@/components/pages/application-error-page";
import { reportClientError } from "@/lib/error-reporting/client";

export function RouterErrorPage({ error, info }: ErrorComponentProps) {
	const router = useRouter();

	useLayoutEffect(() => {
		invalidateAllExchangeRequestIdentities();
		reportClientError(error, {
			kind: "router_boundary",
			componentStack: info?.componentStack,
		});
	}, [error, info?.componentStack]);

	return <ApplicationErrorPage onRetry={() => void router.invalidate()} />;
}
