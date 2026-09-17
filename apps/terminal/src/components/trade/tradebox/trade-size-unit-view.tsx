import { CaretDownIcon } from "@phosphor-icons/react";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

interface Props extends ComponentPropsWithRef<"button"> {
	unit: string | null;
}

export function TradeSizeUnitView({ unit, className, ...props }: Props) {
	return (
		<button
			type="button"
			{...props}
			className={cn(
				"ms-2 inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-xs text-2sm font-semibold text-trading-panel-fg transition-colors duration-[120ms] active:bg-fill-weak focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus disabled:cursor-not-allowed",
				className,
			)}
		>
			<span className={cn(unit === null && "invisible")}>{unit ?? "BTC"}</span>
			<CaretDownIcon className="size-3 text-trading-panel-subtle" />
		</button>
	);
}
