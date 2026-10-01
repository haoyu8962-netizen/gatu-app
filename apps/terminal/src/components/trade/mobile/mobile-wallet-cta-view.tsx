import { buttonVariants } from "@sairn/ui";
import type { ComponentPropsWithRef } from "react";
import { HEADER_ACCOUNT_CONTROL_HEIGHT_CLASS, HEADER_TOUCH_HIT_AREA_CLASS } from "@/config/layout";
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
				HEADER_ACCOUNT_CONTROL_HEIGHT_CLASS,
				HEADER_TOUCH_HIT_AREA_CLASS,
				"min-w-0 max-w-full px-3.5",
				className,
			)}
		>
			<span className="min-w-0 truncate">{label}</span>
		</button>
	);
}
