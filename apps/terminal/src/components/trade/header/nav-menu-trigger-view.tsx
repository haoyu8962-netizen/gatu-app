import { CaretDownIcon } from "@phosphor-icons/react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props extends ComponentPropsWithRef<"button"> {
	variant?: "more" | "language";
	label?: string;
	icon?: ReactNode;
	active?: boolean;
	compactLabel?: boolean;
	labelClassName?: string;
}

export const DESKTOP_LANGUAGE_TRIGGER_CLASS =
	"h-[34px] min-h-[34px] rounded-[10px] px-[9px] text-market-close-muted hover:bg-market-close-hover hover:text-market-close-fg";

export function NavMenuTriggerView({
	variant = "more",
	label,
	icon,
	active = false,
	compactLabel = false,
	labelClassName,
	className,
	disabled,
	...rest
}: Props) {
	return (
		<button
			type="button"
			{...rest}
			disabled={disabled}
			data-disabled={disabled ? "" : undefined}
			className={cn(
				"group inline-flex items-center justify-center cursor-pointer select-none rounded-8 border-0 bg-transparent shadow-none appearance-none font-normal transition-colors duration-150 motion-reduce:transition-none hover:text-fg data-[popup-open]:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus data-disabled:text-fg-disabled data-disabled:cursor-not-allowed",
				variant === "more"
					? "gap-1 h-[34px] rounded-[8px] px-2.5 py-2 text-[13px] leading-[18px] font-semibold whitespace-nowrap text-market-close-muted transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg data-[popup-open]:bg-market-close-hover data-[popup-open]:text-market-close-fg [&>svg]:size-[10px]"
					: "gap-0.5 px-1.5 py-0.5 text-xs h-8 min-h-8 shrink-0 justify-center !py-0 rounded-[10px] font-market-close text-market-close-muted hover:bg-market-close-hover hover:text-market-close-fg active:bg-market-close-hover data-[popup-open]:bg-market-close-hover data-[popup-open]:text-market-close-fg !duration-[120ms]",
				variant === "language" && (label ? "gap-1.5 px-2" : "w-8 !px-0 !gap-0"),
				active && "text-market-close-fg",
				className,
			)}
		>
			{icon}
			{variant === "more"
				? label
				: label && (
						<span
							className={cn(
								"text-[13px] leading-[18px] font-semibold whitespace-nowrap",
								compactLabel && "max-[1181px]:hidden",
								labelClassName,
							)}
						>
							{label}
						</span>
					)}
			{variant === "more" && (
				<CaretDownIcon
					size={12}
					weight="regular"
					className="shrink-0 transition-transform duration-150 motion-reduce:transition-none [[data-popup-open]>&]:rotate-180 text-fg-muted group-hover:text-fg group-data-[popup-open]:text-fg"
				/>
			)}
		</button>
	);
}
