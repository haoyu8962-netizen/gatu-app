import { canHydrateAfterMobileAgentSyncScrub } from "./lib/mobile-sync/bootstrap-fragment";

if (canHydrateAfterMobileAgentSyncScrub) {
	void import("./client-hydrate");
}
