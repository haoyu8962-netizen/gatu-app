import { useQuery } from "@tanstack/react-query";
import { getGeo } from "@/lib/geo/get-geo";

function getDevOverride(): string | null {
	if (!import.meta.env.DEV || typeof window === "undefined") return null;
	return new URLSearchParams(window.location.search).get("geo");
}

export function useGeoRestriction() {
	const override = getDevOverride();
	const { data, isError, isFetching, refetch } = useQuery({
		queryKey: ["geo", override],
		queryFn: () => getGeo({ data: { override } }),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		retry: 1,
	});
	const hasResolvedCountry = typeof data?.country === "string" && data.country.trim().length > 0;
	const isResolved = hasResolvedCountry && !isError;
	const tradeRestricted = hasResolvedCountry && (data?.tradeRestricted === true || data?.proxy === true);

	return {
		actionsBlocked: !isResolved || tradeRestricted,
		tradeRestricted,
		country: data?.country ?? null,
		proxy: data?.proxy ?? false,
		isResolving: isFetching,
		isError,
		isResolved,
		retry: refetch,
	};
}
