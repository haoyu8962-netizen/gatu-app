import { WalletIcon } from "@phosphor-icons/react";
import type { ComponentPropsWithRef } from "react";
import { APP_BAR_BUTTON_HEIGHT_CLASS } from "@/config/layout";
import { cn } from "@/lib/cn";

interface Props extends ComponentPropsWithRef<"button"> {
	label: string;
}
export function MobileWalletCtaView({ label, className, disabled, ...props }: Props) {
	return (
		<button
			type="button"
			{...props}
			disabled={disabled}
			data-disabled={disabled ? "" : undefined}
			className={cn(
				"inline-flex items-center justify-center gap-2 font-semibold select-none cursor-pointer rounded-8 transition-[color,background-color,border-color,opacity,scale] duration-150 ease-out motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus data-disabled:cursor-not-allowed border bg-transparent shadow-raised active:not-data-disabled:scale-[0.97] py-1.5 px-3 text-xs gap-1.5 border-stroke-weak text-fg hover:bg-fill-hover active:bg-fill-press data-disabled:text-fg-disabled data-disabled:border-stroke-disabled",
				APP_BAR_BUTTON_HEIGHT_CLASS,
				"min-w-0 max-w-full",
				"px-3 transition-[color,background-color,border-color] duration-150 ease-out",
				className,
				"pl-2.5",
			)}
		>
			<WalletIcon className="size-3.5" />
			<span className="min-w-0 truncate">{label}</span>
		</button>
	);
}
