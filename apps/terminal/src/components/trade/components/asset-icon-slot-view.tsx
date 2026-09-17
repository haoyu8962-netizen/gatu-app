import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props extends Omit<ComponentPropsWithRef<"button">, "children"> {
	icon: ReactNode;
	interactive: boolean;
}

export function AssetIconSlotView({ icon, interactive, className, ref, ...rest }: Props) {
	const slotClassName = cn(
		"inline-flex size-8 shrink-0 items-center justify-center min-[1001px]:size-9 min-[1001px]:[&_.relative.inline-flex]:size-[26px]",
		className,
	);
	if (!interactive)
		return (
			<span {...rest} role="img" className={slotClassName}>
				{icon}
			</span>
		);
	return (
		<button
			type="button"
			ref={ref}
			{...rest}
			className={cn(
				slotClassName,
				"rounded-8 text-fg transition-colors duration-150 hover:bg-fill-hover active:bg-fill-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus motion-reduce:transition-none",
			)}
		>
			{icon}
		</button>
	);
}
