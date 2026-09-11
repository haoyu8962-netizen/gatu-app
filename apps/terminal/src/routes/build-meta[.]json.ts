import { createFileRoute } from "@tanstack/react-router";
import { APP_BUILD_COMMIT, APP_BUILD_TIME, APP_NAME, APP_RELEASE_ID, APP_RELEASE_VERSION } from "@/config/app";

import { MOBILE_PAIRING_FEATURES } from "@/config/mobile-pairing";
import { MOBILE_SYNC_TICKET_API_VERSION } from "@/lib/mobile-sync/one-time-ticket-policy";

export const Route = createFileRoute("/build-meta.json")({
	server: {
		handlers: {
			GET: () =>
				Response.json(
					{
						name: APP_NAME,
						version: APP_RELEASE_VERSION,
						commit: APP_BUILD_COMMIT,
						release: APP_RELEASE_ID,
						builtAt: APP_BUILD_TIME,
						mobileSync: {
							ticketApiVersion: MOBILE_SYNC_TICKET_API_VERSION,
							legacyRegisterDisabled: true,
							store: "single-process",
							createAndReveal: MOBILE_PAIRING_FEATURES.createAndReveal,
							importFromQr: MOBILE_PAIRING_FEATURES.importFromQr,
						},
					},
					{ headers: { "cache-control": "no-store" } },
				),
		},
	},
});
