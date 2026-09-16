import { cn } from "@/lib/cn";

interface Props {
	label: string;
	checked?: false;
	ariaLabel: string;
	spanAll?: boolean;
	disabled?: boolean;
}

export function TradeCheckboxView({ label, ariaLabel, checked = false, spanAll, disabled = true }: Props) {
	return (
		<label
			className={cn(
				"inline-flex items-start gap-2 select-none",
				disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
				"min-w-0 min-h-5 items-center gap-1.5 max-[1000px]:min-h-8",
				spanAll && "col-span-2",
			)}
		>
			<span className="sr-only">{ariaLabel}</span>
			<span
				aria-hidden="true"
				className={cn(
					"relative inline-flex items-center justify-center shrink-0 border rounded-4 bg-background transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus data-checked:bg-action data-checked:border-transparent data-indeterminate:bg-action data-indeterminate:border-transparent after:content-[''] after:absolute after:top-1/2 after:left-1/2 after:-translate-1/2 after:size-11 size-4 border-stroke-strong",
					"size-[17px] rounded-[5px] border-trading-panel-stroke-control data-checked:border-trading-panel-control data-checked:bg-trading-panel-control",
				)}
			/>
			<input
				type="checkbox"
				defaultChecked={checked}
				tabIndex={-1}
				aria-hidden="true"
				disabled={disabled}
				style={{ display: "none" }}
			/>
			<span className="flex flex-col gap-1">
				<span className="text-xs text-trading-panel-muted">{label}</span>
			</span>
		</label>
	);
}
