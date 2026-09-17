import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { createQueryPersistenceFlush } from "@/lib/query-persistence";

interface Props {
	client: QueryClient;
}

export function QueryPersistenceFlush({ client }: Props) {
	useEffect(() => {
		if (typeof window === "undefined") return;
		const flush = createQueryPersistenceFlush(client);
		function handleVisibilityChange() {
			if (document.visibilityState === "hidden") flush();
		}
		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("pagehide", flush);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("pagehide", flush);
		};
	}, [client]);

	return null;
}
