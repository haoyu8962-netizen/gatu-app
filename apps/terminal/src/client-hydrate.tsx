import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { armMobileSyncDraftExpiryCleanup } from "./lib/mobile-sync/draft-storage";

armMobileSyncDraftExpiryCleanup();
startTransition(() => {
	hydrateRoot(
		document,
		<StrictMode>
			<StartClient />
		</StrictMode>,
	);
});
