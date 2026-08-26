import { useHyperliquid } from "@/lib/hyperliquid";
import { isAccountHistoryAddress } from "@/lib/trade/account-history";
import { AccountActivityFeedSubscriptions } from "./account-activity-feed-subscriptions";

export function AccountActivityFeedOwner() {
	const { clientKey, env } = useHyperliquid();
	if (!isAccountHistoryAddress(clientKey)) return null;

	return <AccountActivityFeedSubscriptions key={`${env}:${clientKey.toLowerCase()}`} user={clientKey} />;
}
