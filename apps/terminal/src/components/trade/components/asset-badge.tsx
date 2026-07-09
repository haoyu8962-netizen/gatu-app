import { Button } from "@gatu/ui";
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
	/**
	 * Size the pill to its content width and keep the name on one line, instead of letting a
	 * narrow (min-w-0) table cell compress it below content width. Opt-in so truncating usages
	 * (e.g. the mobile position card) keep their `max-w-full` + `truncate` behavior.
	 */
	fit?: boolean;
}

const sideDotClass: Record<Side, string> = {
	buy: "bg-success",
	sell: "bg-error",
};

const pillClass =
	"inline-flex items-center gap-1.5 rounded-full border border-stroke-weak bg-fill-weak px-1.5 py-0.5 leading-none";

const pillWidthClass = (fit?: boolean) => (fit ? "w-max shrink-0" : "max-w-full");

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
	fit,
}: Props) {
	const display = (
		<AssetDisplay
			coin={coin}
			iconUrl={iconUrl}
			variant={variant}
			subtitle={subtitle}
			iconClassName="size-4"
			nameClassName={cn("text-xs font-semibold leading-none text-fg", fit && "whitespace-nowrap", nameClassName)}
			subtitleClassName={cn("text-2xs leading-none text-fg-muted", subtitleClassName)}
		/>
	);

	const sideDot = side ? (
		<span className={cn("size-1.5 shrink-0 rounded-full", sideDotClass[side])} aria-hidden="true" />
	) : null;

	if (!onClick) {
		return (
			<span className={cn(pillClass, pillWidthClass(fit), className)}>
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
				pillWidthClass(fit),
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
