import { createFileRoute } from "@tanstack/react-router";
import {
	APP_BUILD_COMMIT,
	APP_BUILD_TIME,
	APP_CHART_LIBRARY_HASH,
	APP_RELEASE_ID,
	APP_RELEASE_VERSION,
} from "@/config/app";
import { createBuildMeta } from "@/config/build-meta";
import { CCTP_DEPOSIT_FEATURES } from "@/config/cctp-deposit";
import { MOBILE_PAIRING_FEATURES } from "@/config/mobile-pairing";
import { PRIVY_FIAT_FUNDING_FEATURES } from "@/config/privy-fiat-funding";

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
						pairing: MOBILE_PAIRING_FEATURES,
						cctpDeposits: CCTP_DEPOSIT_FEATURES,
						privyFiatFunding: PRIVY_FIAT_FUNDING_FEATURES,
						chartLibraryHash: APP_CHART_LIBRARY_HASH,
					}),
					{ headers: { "cache-control": "no-store" } },
				),
		},
	},
});
