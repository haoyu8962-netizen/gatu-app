import { Button } from "@hypeterminal/ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Side } from "@/lib/trade/types";
import { AssetDisplay } from "./asset-display";

interface Props {
	coin: string;
	side?: Side;
	onClick?: () => void;
	variant?: "short" | "full";
	subtitle?: ReactNode;
	iconUrl?: string;
	"aria-label"?: string;
	className?: string;
	nameClassName?: string;
	subtitleClassName?: string;
}

const sideDotClass: Record<Side, string> = {
	buy: "bg-success",
	sell: "bg-error",
};

const pillClass =
	"inline-flex items-center gap-1.5 rounded-full border border-stroke-weak bg-fill-weak px-1.5 py-0.5 leading-none max-w-full";

export function AssetBadge({
	coin,
	side,
	onClick,
	variant,
	subtitle,
	iconUrl,
	"aria-label": ariaLabel,
	className,
	nameClassName,
	subtitleClassName,
}: Props) {
	const display = (
		<AssetDisplay
			coin={coin}
			iconUrl={iconUrl}
			variant={variant}
			subtitle={subtitle}
			iconClassName="size-4"
			nameClassName={cn("text-xs font-semibold leading-none text-fg", nameClassName)}
			subtitleClassName={cn("text-2xs leading-none text-fg-muted", subtitleClassName)}
		/>
	);

	const sideDot = side ? (
		<span className={cn("size-1.5 shrink-0 rounded-full", sideDotClass[side])} aria-hidden="true" />
	) : null;

	if (!onClick) {
		return (
			<span className={cn(pillClass, className)}>
				{sideDot}
				{display}
			</span>
		);
	}

	return (
		<Button
			variant="ghost"
			intent="neutral"
			onClick={onClick}
			aria-label={ariaLabel}
			className={cn(
				pillClass,
				"h-auto min-h-0 font-normal text-fg",
				"hover:bg-fill-hover active:bg-fill-press",
				className,
			)}
		>
			{sideDot}
			{display}
		</Button>
	);
}
