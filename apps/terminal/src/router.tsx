import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ApplicationErrorBoundary } from "@/components/application-error-boundary";
import { getRootProviderContext, RootProvider } from "@/providers/root";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const rqContext = getRootProviderContext();

	const router = createRouter({
		routeTree,
		context: { ...rqContext },
		defaultPreload: "intent",
		defaultPendingMinMs: 0,
		Wrap: (props: { children: React.ReactNode }) => {
			return <ApplicationErrorBoundary>{props.children}</ApplicationErrorBoundary>;
		},
		InnerWrap: (props: { children: React.ReactNode }) => {
			return <RootProvider {...rqContext}>{props.children}</RootProvider>;
		},
	});

	setupRouterSsrQueryIntegration({ router, queryClient: rqContext.queryClient });

	return router;
}
