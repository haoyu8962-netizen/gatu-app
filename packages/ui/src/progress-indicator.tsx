import { ArrowLeftIcon } from "@phosphor-icons/react";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Button } from "./button";
import { cn } from "./utils";

const progressIndicatorVariants = cva([
	"flex flex-col gap-4",
	"data-disabled:opacity-40 data-disabled:cursor-not-allowed",
]);

interface ProgressIndicatorProps
	extends React.HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof progressIndicatorVariants> {
	currentStep: number;
	totalSteps: number;
	label?: React.ReactNode;
	onBack?: () => void;
	backLabel?: string;
	disabled?: boolean;
}

const ProgressIndicator = React.forwardRef<HTMLDivElement, ProgressIndicatorProps>(
	({ className, currentStep, totalSteps, label, onBack, backLabel = "Back", disabled, ...props }, ref) => (
		<div
			className={cn(progressIndicatorVariants({ className }))}
			ref={ref}
			data-disabled={disabled ? "" : undefined}
			{...props}
		>
			<div className="flex flex-col gap-2">
				<p className="text-sm font-semibold text-text-strong tabular-nums">
					{label ?? `Step ${currentStep} of ${totalSteps}`}
				</p>
				<div
					className="flex gap-1"
					role="progressbar"
					aria-valuenow={currentStep}
					aria-valuemin={1}
					aria-valuemax={totalSteps}
					aria-valuetext={`Step ${currentStep} of ${totalSteps}`}
				>
					{Array.from({ length: totalSteps }, (_, i) => (
						<div
							key={i}
							className={cn(
								"h-2 flex-1 rounded-4",
								"transition-colors duration-200 ease-out motion-reduce:transition-none",
								i < currentStep ? "bg-fill-selected" : "border border-stroke-weak bg-fill-weak inset-shadow-sunken",
							)}
						/>
					))}
				</div>
			</div>
			{onBack && (
				<Button
					variant="ghost"
					intent="brand"
					size="sm"
					disabled={disabled}
					onClick={disabled ? undefined : onBack}
					iconLeft={<ArrowLeftIcon size={20} className="shrink-0" />}
				>
					{backLabel}
				</Button>
			)}
		</div>
	),
);
ProgressIndicator.displayName = "ProgressIndicator";

export { ProgressIndicator, progressIndicatorVariants };
export type { ProgressIndicatorProps };
