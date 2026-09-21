import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

interface Props extends ComponentPropsWithRef<"button"> {
	label: string;
}

export const USER_MENU_BUTTON_MIN_WIDTH = "min-w-[9rem]";

export function WalletCtaView({ label, className, disabled, ...rest }: Props) {
	return (
		<button
			type="button"
			{...rest}
			disabled={disabled}
			data-disabled={disabled ? "" : undefined}
			className={cn(
				"inline-flex h-9 min-h-9 shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 rounded-20 bg-action px-4 py-1.5 font-market-close text-2sm font-bold text-on-action",
				"transition-[color,background-color,border-color,scale] duration-150 ease-out motion-reduce:transition-none motion-reduce:active:scale-100",
				"hover:not-data-disabled:bg-action-hover active:not-data-disabled:scale-[0.97] active:not-data-disabled:bg-action-active",
				"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
				"data-disabled:cursor-not-allowed data-disabled:bg-fill-disabled data-disabled:text-fg-disabled",
				USER_MENU_BUTTON_MIN_WIDTH,
				className,
			)}
		>
			<span>{label}</span>
		</button>
	);
}
