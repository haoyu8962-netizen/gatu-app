import { Avatar } from "@sairn/ui";
import type { ReactNode } from "react";
import { BUILDER_DEX_SEPARATOR, getIconUrlFromMarketName } from "@/domain/market";
import { cn } from "@/lib/cn";
import type { SpotToken, UnifiedMarket } from "@/lib/hyperliquid/markets";
import { useMarkets } from "@/lib/hyperliquid/markets/use-markets";

interface Props {
	coin: string;
	isToken?: boolean;
	iconUrl?: string;
	variant?: "short" | "full";
	subtitle?: ReactNode;
	hideIcon?: boolean;
	hideName?: boolean;
	className?: string;
	iconClassName?: string;
	nameClassName?: string;
	subtitleClassName?: string;
}

function resolveName(
	market: UnifiedMarket | undefined,
	token: SpotToken | undefined,
	coin: string,
	variant: "short" | "full" | undefined,
): string {
	if (market) {
		if (variant === "full") return market.pairName;
		if (variant === "short") return market.shortName;
		return market.kind === "spot" ? market.pairName : market.shortName;
	}
	if (token) return token.displayName;
	return coin;
}

function getBuilderBaseIconUrl(coin: string): string | undefined {
	if (!coin.includes(BUILDER_DEX_SEPARATOR)) return undefined;
	const base = coin.split(BUILDER_DEX_SEPARATOR).pop();
	if (!base || base === coin) return undefined;
	return getIconUrlFromMarketName(base, "perp");
}

function uniqueUrls(urls: (string | undefined)[]): string[] {
	return Array.from(new Set(urls.filter((url): url is string => !!url)));
}

function resolveIconUrls(
	market: UnifiedMarket | undefined,
	token: SpotToken | undefined,
	coin: string,
	iconUrlOverride: string | undefined,
): string[] {
	const namespacedBuilderIcon = coin.includes(BUILDER_DEX_SEPARATOR)
		? getIconUrlFromMarketName(coin, "builderPerp")
		: undefined;
	const baseBuilderIcon = getBuilderBaseIconUrl(market?.name ?? coin);
	return uniqueUrls([iconUrlOverride, market?.iconUrl, token?.iconUrl, namespacedBuilderIcon, baseBuilderIcon]);
}

function getFallbackText(name: string): string {
	return name.slice(0, 2).toUpperCase();
}

export function AssetDisplay({
	coin,
	isToken = false,
	iconUrl: iconUrlOverride,
	variant,
	subtitle,
	hideIcon = false,
	hideName = false,
	className,
	iconClassName,
	nameClassName,
	subtitleClassName,
}: Props) {
	const markets = useMarkets();
	const market = isToken ? undefined : markets.getMarket(coin);
	const token = !market ? markets.getToken(coin) : undefined;

	const showIcon = !hideIcon;
	const showName = !hideName;
	const name = resolveName(market, token, coin, variant);
	const iconUrls = resolveIconUrls(market, token, coin, iconUrlOverride);
	const [iconUrl, ...fallbackIconUrls] = iconUrls;
	const fallbackText = getFallbackText(name);

	const icon = (
		<Avatar
			className={cn("size-4", iconClassName)}
			size="sm"
			src={iconUrl}
			fallbackSrcs={fallbackIconUrls}
			alt={name}
			initials={fallbackText}
		/>
	);

	if (showIcon && !showName) {
		return (
			<span className={cn("inline-flex shrink-0 items-center justify-center leading-none", className)}>{icon}</span>
		);
	}

	if (!showIcon && showName) {
		return <span className={cn(nameClassName, className)}>{name}</span>;
	}

	if (!showIcon && !showName) {
		return null;
	}

	return (
		<span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
			{icon}
			{subtitle ? (
				<span className="flex min-w-0 flex-col items-start">
					<span className={nameClassName}>{name}</span>
					<span className={subtitleClassName}>{subtitle}</span>
				</span>
			) : (
				<span className={nameClassName}>{name}</span>
			)}
		</span>
	);
}
