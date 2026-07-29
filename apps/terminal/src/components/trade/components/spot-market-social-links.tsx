import { Tooltip } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { GlobeSimpleIcon, TelegramLogoIcon, XLogoIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { SpotAssetSocials } from "@/domain/market/spot-asset-info";

interface Props {
	socials: SpotAssetSocials | null;
}

interface SocialLinkProps {
	href: string;
	label: string;
	icon: ReactNode;
}

function SocialLink({ href, label, icon }: SocialLinkProps) {
	return (
		<Tooltip content={label} side="bottom" sideOffset={4} delay={300} arrow={false}>
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				aria-label={label}
				className="inline-flex size-3 items-center justify-center text-brand transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus motion-reduce:transition-none"
			>
				{icon}
			</a>
		</Tooltip>
	);
}

export function SpotMarketSocialLinks({ socials }: Props) {
	if (!socials) return null;

	return (
		<div className="hidden h-[34px] shrink-0 grid-rows-[15px_15px] gap-1 min-[1001px]:grid">
			<span className="min-w-16 max-w-32 truncate text-xs leading-[15px] text-fg-muted" title={socials.displayName}>
				{socials.displayName}
			</span>
			<div className="flex h-[15px] items-center gap-2">
				{socials.x ? (
					<SocialLink href={socials.x} label="X" icon={<XLogoIcon className="size-3" aria-hidden />} />
				) : null}
				{socials.telegram ? (
					<SocialLink
						href={socials.telegram}
						label="Telegram"
						icon={<TelegramLogoIcon className="size-3" aria-hidden />}
					/>
				) : null}
				{socials.website ? (
					<SocialLink
						href={socials.website}
						label={t`Website`}
						icon={<GlobeSimpleIcon className="size-3" aria-hidden />}
					/>
				) : null}
			</div>
		</div>
	);
}
