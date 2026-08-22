import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import { handleMobileSyncTicket } from "@/lib/mobile-sync/one-time-ticket-server";

export const Route = createFileRoute("/mobile-agent-sync-ticket")({
	server: {
		handlers: {
			POST: ({ request }) =>
				handleMobileSyncTicket(request, {
					sourceKey: getRequestIP({ xForwardedFor: true }),
				}),
		},
	},
});
