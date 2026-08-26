import { useSubscription } from "@/lib/hyperliquid";

interface Props {
	user: `0x${string}`;
}

export function AccountActivityFeedSubscriptions({ user }: Props) {
	useSubscription("userFills", { user, aggregateByTime: true });
	useSubscription("userFundings", { user });
	useSubscription("userHistoricalOrders", { user });
	useSubscription("userTwapHistory", { user });
	useSubscription("userTwapSliceFills", { user });

	return null;
}
