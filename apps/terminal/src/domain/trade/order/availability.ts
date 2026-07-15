export type AssetAvailabilityStatus = "idle" | "loading" | "success" | "error";

interface ActiveAssetIdentity {
	coin: string;
	user: string;
}

interface GetAssetAvailabilityStatusInput {
	isConnected: boolean;
	isPerpMarket: boolean;
	coin: string | undefined;
	user: string | undefined;
	data: ActiveAssetIdentity | undefined;
	subscriptionStatus: "idle" | "subscribing" | "active" | "error";
	isStale: boolean;
}

export function getAssetAvailabilityStatus({
	isConnected,
	isPerpMarket,
	coin,
	user,
	data,
	subscriptionStatus,
	isStale,
}: GetAssetAvailabilityStatusInput): AssetAvailabilityStatus {
	if (!isConnected || !isPerpMarket || !coin || !user) return "idle";
	if (subscriptionStatus === "error") return "error";
	if (subscriptionStatus !== "active" || isStale || !data) return "loading";

	const matchesCoin = data.coin === coin;
	const matchesUser = data.user.toLowerCase() === user.toLowerCase();
	return matchesCoin && matchesUser ? "success" : "loading";
}
