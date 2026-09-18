import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

interface Props extends ComponentPropsWithRef<"button"> {
	"aria-label": string;
	"data-slot"?: string;
	size?: "sm" | "md";
}

export const HEADER_ICON_BUTTON_CLASS =
	"size-9 rounded-[10px] text-market-close-muted hover:bg-market-close-hover hover:text-market-close-fg";

export function HeaderIconButtonView({ className, children, disabled, tabIndex, size = "sm", ...rest }: Props) {
	return (
		<button
			type="button"
			{...rest}
			disabled={disabled}
			tabIndex={disabled ? undefined : tabIndex}
			data-disabled={disabled ? "" : undefined}
			className={cn(
				"inline-flex items-center justify-center shrink-0 select-none cursor-pointer rounded-8 transition-[color,background-color,border-color,opacity,scale] duration-150 ease-out motion-reduce:transition-none motion-reduce:active:scale-100 active:not-data-disabled:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus data-disabled:cursor-not-allowed size-8 relative before:absolute before:-inset-2 before:content-[''] bg-transparent text-fg hover:bg-fill-hover active:bg-fill-press data-disabled:text-fg-disabled",
				size === "md" && "size-10 before:-inset-1",
				className,
			)}
		>
			{children}
		</button>
	);
}
