import { useQuery } from "@tanstack/react-query";
import { getGeo } from "@/lib/geo/get-geo";

function getDevOverride(): string | null {
	if (!import.meta.env.DEV || typeof window === "undefined") return null;
	return new URLSearchParams(window.location.search).get("geo");
}

export function useGeoRestriction() {
	const override = getDevOverride();
	const { data, isError, isLoading, refetch } = useQuery({
		queryKey: ["geo", override],
		queryFn: () => getGeo({ data: { override } }),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		retry: 1,
	});

	return {
		tradeRestricted: data?.tradeRestricted ?? false,
		country: data?.country ?? null,
		proxy: data?.proxy ?? false,
		isResolving: isLoading,
		isError,
		isResolved: data !== undefined && !isError,
		retry: refetch,
	};
}
