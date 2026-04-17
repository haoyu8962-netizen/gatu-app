import { XIcon } from "@phosphor-icons/react";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { DEFAULT_ALERT_SIZE } from "./config";
import { cn } from "./utils";

type AlertTone =
	| "error"
	| "warning"
	| "success"
	| "information"
	| "neutral"
	| "brand"
	| "inverse-neutral"
	| "inverse-brand";

const alertVariants = cva(["flex items-start overflow-clip rounded-8"], {
	variants: {
		tone: {
			error: "bg-error-soft border border-stroke-error-weak",
			warning: "bg-warning-soft border border-stroke-warning-weak",
			success: "bg-success-soft border border-stroke-success-weak",
			information: "bg-info-soft border border-stroke-info-weak",
			neutral: "bg-fill-weaker border border-stroke-weak",
			brand: "bg-brand-soft border border-stroke-brand-weak",
			"inverse-neutral": "bg-inverse-surface",
			"inverse-brand": "bg-brand",
		},
	},
	defaultVariants: {
		tone: "neutral",
	},
});

const toneColors: Record<
	AlertTone,
	{
		accent: string;
		icon: string;
		title: string;
		description: string;
		close: string;
	}
> = {
	error: {
		accent: "bg-stroke-error-strong",
		icon: "text-icon-error",
		title: "text-fg",
		description: "text-fg-muted",
		close: "text-icon",
	},
	warning: {
		accent: "bg-stroke-warning-strong",
		icon: "text-icon-warning",
		title: "text-fg",
		description: "text-fg-muted",
		close: "text-icon",
	},
	success: {
		accent: "bg-stroke-success-strong",
		icon: "text-icon-success",
		title: "text-fg",
		description: "text-fg-muted",
		close: "text-icon",
	},
	information: {
		accent: "bg-stroke-info-strong",
		icon: "text-icon-info",
		title: "text-fg",
		description: "text-fg-muted",
		close: "text-icon",
	},
	neutral: {
		accent: "bg-stroke-strong",
		icon: "text-icon",
		title: "text-fg",
		description: "text-fg-muted",
		close: "text-icon",
	},
	brand: {
		accent: "bg-stroke-brand-strong",
		icon: "text-icon-brand",
		title: "text-fg",
		description: "text-fg-muted",
		close: "text-icon",
	},
	"inverse-neutral": {
		accent: "bg-stroke-inverse-strong",
		icon: "text-icon-inverse",
		title: "text-fg-inverse",
		description: "text-fg-inverse-muted",
		close: "text-icon-inverse",
	},
	"inverse-brand": {
		accent: "bg-stroke-inverse-strong",
		icon: "text-icon-inverse",
		title: "text-fg-inverse",
		description: "text-fg-inverse-muted",
		close: "text-icon-inverse",
	},
};

interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">, VariantProps<typeof alertVariants> {
	tone?: AlertTone;
	size?: "xxs" | "xs" | "sm" | "md" | "lg";
	layout?: "horizontal" | "vertical";
	borderLeft?: boolean;
	icon?: React.ReactNode;
	title?: string;
	description?: string;
	actions?: React.ReactNode;
	onClose?: () => void;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
	(
		{
			className,
			tone = "neutral",
			size: sizeProp,
			layout = "horizontal",
			borderLeft = true,
			icon,
			title,
			description,
			actions,
			onClose,
			children,
			...props
		},
		ref,
	) => {
		const size = sizeProp ?? DEFAULT_ALERT_SIZE;
		const colors = toneColors[tone];
		const isVertical = layout === "vertical";

		const paddingClass =
			size === "xxs" ? "p-2" : size === "xs" ? "p-3" : size === "sm" ? "p-4" : size === "md" ? "p-5" : "p-6";

		const titleTextClass =
			size === "xxs"
				? "text-2xs"
				: size === "xs" || size === "sm"
					? "text-xs"
					: size === "md"
						? "text-sm"
						: "text-base";

		const descTextClass = size === "md" || size === "lg" ? "text-sm" : "text-xs";

		const iconWrapperSize =
			size === "xxs" || size === "xs" ? "size-4" : size === "sm" || size === "md" ? "size-5" : "size-6";

		const closeIconSize = size === "xxs" || size === "xs" ? 10 : 12;

		return (
			<div className={cn(alertVariants({ tone, className }))} ref={ref} role="alert" {...props}>
				{borderLeft && <div className={cn("self-stretch shrink-0 w-1", colors.accent)} />}
				<div
					className={cn(
						"flex flex-1 gap-3 min-w-px",
						paddingClass,
						isVertical ? "flex-col items-start" : "items-start",
					)}
				>
					{icon && (
						<div className={cn("shrink-0 flex items-center justify-center", iconWrapperSize, colors.icon)}>{icon}</div>
					)}
					<div className="flex flex-1 flex-col gap-1 min-w-px">
						{title && <p className={cn("font-semibold text-balance", titleTextClass, colors.title)}>{title}</p>}
						{description && (
							<p className={cn("font-normal text-pretty", descTextClass, colors.description)}>{description}</p>
						)}
						{children}
					</div>
					{actions && <div className="flex items-center gap-2 shrink-0 self-stretch">{actions}</div>}
					{onClose && (
						<button
							onClick={onClose}
							className={cn(
								"relative shrink-0 size-6 flex items-center justify-center cursor-pointer rounded-4",
								"hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
								"after:content-[''] after:absolute after:top-1/2 after:left-1/2 after:-translate-1/2 after:size-11",
								colors.close,
							)}
							aria-label="Close alert"
						>
							<XIcon size={closeIconSize} weight="bold" />
						</button>
					)}
				</div>
			</div>
		);
	},
);
Alert.displayName = "Alert";

export { Alert, alertVariants };
export type { AlertProps, AlertTone };
