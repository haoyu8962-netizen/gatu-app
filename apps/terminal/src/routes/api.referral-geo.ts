import { createFileRoute } from "@tanstack/react-router";
import { getGeoApiHandlers } from "@/lib/geo/geo-api-server";

export const Route = createFileRoute("/api/referral-geo")({
	server: {
		handlers: {
			ANY: ({ request }) => getGeoApiHandlers().referralActionGeo(request),
		},
	},
});
