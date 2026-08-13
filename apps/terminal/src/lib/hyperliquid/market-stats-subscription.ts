const MARKET_STATS_IDLE_ROUTE_PREFIXES = ["/referrals", "/join"] as const;

export function shouldSubscribeToMarketStats(pathname: string): boolean {
	return !MARKET_STATS_IDLE_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
