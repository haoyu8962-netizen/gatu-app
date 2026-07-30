import { Tooltip } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { GlobeSimpleIcon, TelegramLogoIcon, XLogoIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { SpotAssetSocials } from "@/domain/market/spot-asset-info";
import { cn } from "@/lib/cn";

interface Props {
	socials: SpotAssetSocials | null;
}

interface IconLinksProps extends Props {
	className?: string;
	showTooltips?: boolean;
}

interface SocialLinkProps {
	href: string;
	label: string;
	icon: ReactNode;
	showTooltip: boolean;
}

function SocialLink({ href, label, icon, showTooltip }: SocialLinkProps) {
	const link = (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={label}
			className="inline-flex size-3 items-center justify-center text-brand transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus motion-reduce:transition-none"
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

export function SpotMarketSocialIconLinks({ socials, className, showTooltips = true }: IconLinksProps) {
	if (!socials || (!socials.x && !socials.telegram && !socials.website)) return null;

	return (
		<span className={cn("inline-flex items-center", className)}>
			{socials.x ? (
				<SocialLink
					href={socials.x}
					label="X"
					icon={<XLogoIcon className="size-3" aria-hidden />}
					showTooltip={showTooltips}
				/>
			) : null}
			{socials.telegram ? (
				<SocialLink
					href={socials.telegram}
					label="Telegram"
					icon={<TelegramLogoIcon className="size-3" aria-hidden />}
					showTooltip={showTooltips}
				/>
			) : null}
			{socials.website ? (
				<SocialLink
					href={socials.website}
					label={t`Website`}
					icon={<GlobeSimpleIcon className="size-3" aria-hidden />}
					showTooltip={showTooltips}
				/>
			) : null}
		</span>
	);
}

export function SpotMarketSocialLinks({ socials }: Props) {
	if (!socials) return null;

	return (
		<div className="hidden h-[34px] shrink-0 grid-rows-[15px_15px] gap-1 min-[1001px]:grid">
			<span className="min-w-16 max-w-32 truncate text-xs leading-[15px] text-fg-muted" title={socials.displayName}>
				{socials.displayName}
			</span>
			<SpotMarketSocialIconLinks socials={socials} className="h-[15px] gap-2" />
		</div>
	);
}
