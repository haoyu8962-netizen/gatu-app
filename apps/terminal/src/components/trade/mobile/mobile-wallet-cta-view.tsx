import { buttonVariants } from "@gatu/ui";
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
				buttonVariants({ variant: "filled", intent: "brand", size: "sm" }),
				APP_BAR_BUTTON_HEIGHT_CLASS,
				"min-w-0 max-w-full px-3.5",
				className,
			)}
		>
			<span className="min-w-0 truncate">{label}</span>
		</button>
	);
}
