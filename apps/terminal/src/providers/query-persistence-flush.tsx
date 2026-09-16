import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { createQueryPersistenceFlush } from "@/lib/query-persistence";

export function QueryPersistenceFlush() {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (typeof window === "undefined") return;
		const flush = createQueryPersistenceFlush(queryClient);
		function handleVisibilityChange() {
			if (document.visibilityState === "hidden") flush();
		}
		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("pagehide", flush);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("pagehide", flush);
		};
	}, [queryClient]);

	return null;
}
