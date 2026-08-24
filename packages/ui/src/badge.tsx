import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { DEFAULT_SIZE } from "./config";
import { cn } from "./utils";

type BadgeTone = "error" | "warning" | "success" | "information" | "neutral" | "brand";

const badgeVariants = cva(["inline-flex items-center font-semibold rounded-full border"], {
	variants: {
		tone: {
			error: "bg-error-soft border-stroke-error-weak text-error",
			warning: "bg-warning-soft border-stroke-warning-weak text-warning",
			success: "bg-success-soft border-stroke-success-weak text-success",
			information: "bg-info-soft border-stroke-info-weak text-info",
			neutral: "bg-fill-weak border-stroke-weak text-fg",
			brand: "bg-signal-soft border-stroke-signal/30 text-signal",
		},
		size: {
			xxs: "px-1 py-0 text-2xs gap-0.5",
			xs: "px-1.5 py-px text-xs gap-0.5",
			sm: "px-2 py-0.5 text-xs gap-1",
			md: "px-3 py-1 text-xs gap-1.5",
			lg: "px-4 py-1.5 text-sm gap-2",
		},
	},
	defaultVariants: {
		tone: "neutral",
		size: "sm",
	},
});

const dotColors: Record<BadgeTone, string> = {
	error: "bg-error",
	warning: "bg-warning",
	success: "bg-success",
	information: "bg-info",
	neutral: "bg-fill",
	brand: "bg-signal",
};

const iconColors: Record<BadgeTone, string> = {
	error: "text-icon-error",
	warning: "text-icon-warning",
	success: "text-icon-success",
	information: "text-icon-info",
	neutral: "text-icon",
	brand: "text-icon-signal",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
	tone?: BadgeTone;
	icon?: React.ReactNode;
	dot?: boolean;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
	({ className, tone = "neutral", size: sizeProp, icon, dot, children, ...props }, ref) => {
		const size = sizeProp ?? DEFAULT_SIZE;

		return (
			<span className={cn(badgeVariants({ tone, size, className }))} ref={ref} {...props}>
				{icon && <span className={cn("shrink-0 flex items-center", iconColors[tone])}>{icon}</span>}
				{!icon && dot && <span className={cn("shrink-0 size-2 rounded-full", dotColors[tone])} />}
				{children}
			</span>
		);
	},
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
export type { BadgeProps, BadgeTone };
