import { CaretDownIcon } from "@phosphor-icons/react";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

interface Props extends ComponentPropsWithRef<"button"> {
	label: string | null;
	mobile?: boolean;
}

export function OrderbookGroupingTriggerView({ label, className, disabled, mobile, ...rest }: Props) {
	return (
		<button
			type="button"
			{...rest}
			disabled={disabled}
			data-disabled={disabled ? "" : undefined}
			className={cn(
				"group inline-flex items-center justify-center cursor-pointer select-none rounded-8 border-0 bg-transparent shadow-none appearance-none font-normal transition-colors duration-150 motion-reduce:transition-none hover:text-fg data-[popup-open]:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus data-disabled:text-fg-disabled data-disabled:cursor-not-allowed gap-0.5 px-1 py-0.5 text-2xs",
				!mobile && "min-w-0 max-w-full",
				mobile && "gap-0.5 px-1.5 py-0.5 text-xs relative min-h-6 tabular-nums text-trading-panel-muted",
				className,
			)}
		>
			{mobile ? (
				label
			) : (
				<span className={cn("block min-w-0 truncate text-xs tabular-nums", label === null && "invisible")}>
					{label ?? "0.01"}
				</span>
			)}
			{!mobile && (
				<CaretDownIcon
					size={12}
					weight="regular"
					className="shrink-0 transition-transform duration-150 motion-reduce:transition-none [[data-popup-open]>&]:rotate-180 text-fg-muted group-hover:text-fg group-data-[popup-open]:text-fg"
				/>
			)}
		</button>
	);
}
