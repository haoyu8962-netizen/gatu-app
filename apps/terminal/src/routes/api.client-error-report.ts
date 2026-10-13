import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import { handleClientErrorReport } from "@/lib/error-reporting/server";

export const Route = createFileRoute("/api/client-error-report")({
	server: {
		handlers: {
			POST: ({ request }) =>
				handleClientErrorReport(request, { resolveClientIp: () => getRequestIP({ xForwardedFor: true }) }),
		},
	},
});
