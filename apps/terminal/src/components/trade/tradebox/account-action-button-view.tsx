import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

interface Props extends ComponentPropsWithRef<"button"> {
	variant: "filled" | "outline";
	label: string;
	focusableWhenDisabled?: boolean;
}

export function AccountActionButtonView({
	variant,
	label,
	disabled = false,
	focusableWhenDisabled = false,
	tabIndex = 0,
	className,
	onClick,
	onKeyDown,
	onMouseDown,
	onPointerDown,
	onKeyUp,
	...rest
}: Props) {
	return (
		<button
			type="button"
			{...rest}
			tabIndex={tabIndex}
			disabled={focusableWhenDisabled ? undefined : disabled}
			aria-disabled={focusableWhenDisabled ? disabled : undefined}
			data-disabled={disabled ? "" : undefined}
			onClick={(event) => {
				if (disabled) {
					event.preventDefault();
					return;
				}
				onClick?.(event);
			}}
			onKeyDown={(event) => {
				if (disabled) {
					if (focusableWhenDisabled && event.key !== "Tab") event.preventDefault();
					return;
				}
				onKeyDown?.(event);
			}}
			onPointerDown={(event) => {
				if (disabled) {
					event.preventDefault();
					return;
				}
				onPointerDown?.(event);
			}}
			onKeyUp={(event) => {
				if (!disabled) onKeyUp?.(event);
			}}
			onMouseDown={(event) => {
				if (!disabled) onMouseDown?.(event);
			}}
			className={cn(
				"inline-flex items-center justify-center gap-2 font-semibold select-none cursor-pointer rounded-8 transition-[color,background-color,border-color,opacity,scale] duration-150 ease-out motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus data-disabled:cursor-not-allowed",
				variant === "filled"
					? "shadow-raised active:not-data-disabled:scale-[0.97]"
					: "border bg-transparent shadow-raised active:not-data-disabled:scale-[0.97]",
				"py-1.5 px-3 text-xs gap-1.5",
				variant === "filled"
					? "bg-fill text-fg-inverse hover:opacity-90 active:opacity-80 data-disabled:text-fg-disabled data-disabled:bg-fill-disabled"
					: "border-stroke-weak text-fg hover:bg-fill-hover active:bg-fill-press data-disabled:text-fg-disabled data-disabled:border-stroke-disabled",
				"min-h-8 min-w-0 rounded-8 font-semibold shadow-none",
				className,
			)}
		>
			{label}
		</button>
	);
}
