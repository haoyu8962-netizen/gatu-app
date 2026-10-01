import { useLingui } from "@lingui/react/macro";
import { GlobeSimpleIcon, TelegramLogoIcon, XLogoIcon } from "@phosphor-icons/react";
import { Tooltip } from "@sairn/ui";
import type { ReactNode } from "react";
import { hasSpotSocialLinks, type SpotAssetSocials } from "@/domain/market/spot-asset-info";
import { cn } from "@/lib/cn";

interface SpotMarketSocialLinksProps {
	socials: SpotAssetSocials | null;
}

interface SpotMarketSocialIconLinksProps {
	className?: string;
	showTooltips?: boolean;
	socials: SpotAssetSocials | null;
	targetSize?: "compact" | "touch";
}

interface SocialLinkProps {
	href: string;
	label: string;
	icon: ReactNode;
	showTooltip: boolean;
	targetSize: "compact" | "touch";
}

function SocialLink({ href, label, icon, showTooltip, targetSize }: SocialLinkProps) {
	const link = (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={label}
			className={cn(
				"inline-flex items-center justify-center text-trading-panel-muted transition-colors duration-150 hover:text-trading-panel-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus motion-reduce:transition-none",
				targetSize === "touch" && "h-11 w-9 shrink-0 rounded-[7px] hover:bg-trading-panel-hover active:bg-fill-press",
				targetSize === "compact" && "size-4",
			)}
		>
			{icon}
		</a>
	);

	if (!showTooltip) return link;

	return (
		<Tooltip content={label} side="bottom" sideOffset={4} delay={300} arrow={false}>
			{link}
		</Tooltip>
	);
}

export function SpotMarketSocialIconLinks({
	socials,
	className,
	showTooltips = true,
	targetSize = "compact",
}: SpotMarketSocialIconLinksProps) {
	const { t } = useLingui();
	if (!hasSpotSocialLinks(socials)) return null;

	return (
		<span className={cn("inline-flex items-center", className)}>
			{socials.x ? (
				<SocialLink
					href={socials.x}
					label="X"
					icon={<XLogoIcon className="size-3.5" aria-hidden />}
					showTooltip={showTooltips}
					targetSize={targetSize}
				/>
			) : null}
			{socials.telegram ? (
				<SocialLink
					href={socials.telegram}
					label="Telegram"
					icon={<TelegramLogoIcon className="size-3.5" aria-hidden />}
					showTooltip={showTooltips}
					targetSize={targetSize}
				/>
			) : null}
			{socials.website ? (
				<SocialLink
					href={socials.website}
					label={t`Website`}
					icon={<GlobeSimpleIcon className="size-3.5" aria-hidden />}
					showTooltip={showTooltips}
					targetSize={targetSize}
				/>
			) : null}
		</span>
	);
}

export function SpotMarketSocialLinks({ socials }: SpotMarketSocialLinksProps) {
	if (!socials) return null;

	return (
		<div className="hidden h-[34px] shrink-0 grid-rows-[12px_16px] gap-1.5 font-market-close min-[1001px]:grid">
			<span
				className="min-w-16 max-w-32 truncate text-3xs leading-3 text-trading-panel-subtle"
				title={socials.displayName}
			>
				{socials.displayName}
			</span>
			<SpotMarketSocialIconLinks socials={socials} className="h-4 gap-1" />
		</div>
	);
}
