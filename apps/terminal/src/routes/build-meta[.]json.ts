import { createFileRoute } from "@tanstack/react-router";
import { APP_BUILD_COMMIT, APP_BUILD_TIME, APP_NAME, APP_RELEASE_ID, APP_RELEASE_VERSION } from "@/config/app";

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
					},
					{ headers: { "cache-control": "no-store" } },
				),
		},
	},
});
