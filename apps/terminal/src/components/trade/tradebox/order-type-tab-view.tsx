import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

interface Props extends ComponentPropsWithRef<"button"> {
	active: boolean;
	label: string;
	labelCompact?: string;
}

export function orderTypeTabClass(active: boolean) {
	return cn(
		"trade-order-type-button min-w-0 border-b border-trading-panel-stroke-card pt-1.5 pb-2 text-sm transition-colors",
		"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
		active ? "font-bold text-trading-panel-fg" : "font-medium text-trading-panel-subtle hover:text-trading-panel-fg",
	);
}

export function OrderTypeTabView({ active, label, labelCompact, className, disabled, ...props }: Props) {
	const advanced = labelCompact !== undefined;
	return (
		<button
			type="button"
			aria-pressed={advanced ? undefined : active}
			{...props}
			disabled={disabled}
			data-disabled={disabled ? "" : undefined}
			className={cn(
				advanced &&
					"group inline-flex items-center justify-center cursor-pointer select-none rounded-8 border-0 bg-transparent shadow-none appearance-none font-normal transition-colors duration-150 motion-reduce:transition-none hover:text-fg data-[popup-open]:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus data-disabled:text-fg-disabled data-disabled:cursor-not-allowed gap-0.5 px-1.5 py-0.5 text-xs",
				orderTypeTabClass(active),
				advanced && "w-full rounded-none hover:text-trading-panel-fg data-[popup-open]:text-trading-panel-fg",
				className,
			)}
		>
			{advanced ? (
				<span className="inline-flex min-w-0 items-center justify-center">
					<span className="trade-full-label truncate">{label}</span>
					<span className="trade-compact-label truncate">{labelCompact}</span>
				</span>
			) : (
				<span className="block truncate">{label}</span>
			)}
		</button>
	);
}
