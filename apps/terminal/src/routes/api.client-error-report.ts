import { createFileRoute } from "@tanstack/react-router";
import { handleClientErrorReport } from "@/lib/error-reporting/server";

export const Route = createFileRoute("/api/client-error-report")({
	server: {
		handlers: {
			POST: ({ request }) => handleClientErrorReport(request),
		},
	},
});
