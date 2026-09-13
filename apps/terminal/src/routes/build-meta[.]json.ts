import { createFileRoute } from "@tanstack/react-router";
import { APP_BUILD_COMMIT, APP_BUILD_TIME, APP_RELEASE_ID, APP_RELEASE_VERSION } from "@/config/app";
import { createBuildMeta } from "@/config/build-meta";
import { MOBILE_PAIRING_FEATURES } from "@/config/mobile-pairing";
import { MOBILE_SYNC_TICKET_API_VERSION } from "@/lib/mobile-sync/one-time-ticket-policy";

export const Route = createFileRoute("/build-meta.json")({
	server: {
		handlers: {
			GET: () =>
				Response.json(
					createBuildMeta({
						version: APP_RELEASE_VERSION,
						commit: APP_BUILD_COMMIT,
						release: APP_RELEASE_ID,
						builtAt: APP_BUILD_TIME,
						ticketApiVersion: MOBILE_SYNC_TICKET_API_VERSION,
						pairing: MOBILE_PAIRING_FEATURES,
					}),
					{ headers: { "cache-control": "no-store" } },
				),
		},
	},
});
