import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

const LEGAL_STATUS_QUERY_PREFIX = ["hl", "info", "legalCheck"] as const;

/** Invalidates legal authorization immediately after an iOS/Safari BFCache restore. */
export function useLegalStatusLifecycle(): void {
	const queryClient = useQueryClient();

	useEffect(() => {
		function handlePageShow(event: PageTransitionEvent) {
			if (!event.persisted) return;
			// Wallet events can arrive after `pageshow`. Invalidate every in-memory
			// legal result so neither the owner captured before suspension nor a
			// newly activated owner can reuse a pre-BFCache authorization.
			void queryClient.invalidateQueries({ queryKey: LEGAL_STATUS_QUERY_PREFIX });
		}

		window.addEventListener("pageshow", handlePageShow);
		return () => window.removeEventListener("pageshow", handlePageShow);
	}, [queryClient]);
}
