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
				"inline-flex items-center justify-center gap-1.5 rounded-8 shadow-raised select-none cursor-pointer py-1.5 transition-[color,background-color,border-color] duration-150 ease-out motion-reduce:transition-none motion-reduce:active:scale-100 active:not-data-disabled:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus data-disabled:cursor-not-allowed data-disabled:text-fg-disabled data-disabled:bg-fill-disabled active:opacity-80 shrink-0 h-9 min-h-9 rounded-[10px] bg-action px-4 font-market-close text-[13px] leading-[18px] font-bold text-on-action shadow-none hover:bg-action-hover hover:opacity-90 active:bg-action-active",
				USER_MENU_BUTTON_MIN_WIDTH,
				className,
			)}
		>
			<span>{label}</span>
		</button>
	);
}
