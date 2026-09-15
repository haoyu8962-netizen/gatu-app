import { createFileRoute } from "@tanstack/react-router";
import { handleClientErrorReport } from "@/lib/error-reporting/server";

// Compatibility alias for clients that loaded a bundle before the endpoint moved under `/api/`.
// Remove once no release older than that move can still be open in a browser.
export const Route = createFileRoute("/client-error-report")({
	server: {
		handlers: {
			POST: ({ request }) => handleClientErrorReport(request),
		},
	},
});
