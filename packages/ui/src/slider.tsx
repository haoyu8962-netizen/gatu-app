import { Field } from "@base-ui/react/field";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "./utils";

const sliderVariants = cva([
	"flex w-full touch-none select-none flex-col gap-2",
	"data-disabled:opacity-40 data-disabled:cursor-not-allowed",
]);

type SliderThumbSize = "sm" | "md" | "lg";

interface SliderProps
	extends Omit<
			React.ComponentPropsWithoutRef<typeof BaseSlider.Root>,
			"aria-describedby" | "aria-invalid" | "className"
		>,
		VariantProps<typeof sliderVariants> {
	"aria-describedby"?: string;
	"aria-invalid"?: boolean;
	className?: string;
	controlClassName?: string;
	getAriaValueText?: React.ComponentPropsWithoutRef<typeof BaseSlider.Thumb>["getAriaValueText"];
	indicatorClassName?: string;
	label: string;
	labelHidden?: boolean;
	showValue?: boolean;
	thumbClassName?: string;
	thumbSize?: SliderThumbSize;
	trackClassName?: string;
}

const thumbSizeClasses: Record<SliderThumbSize, string> = {
	sm: "size-3",
	md: "size-4",
	lg: "size-6",
};

const thumbHitAreaClasses: Record<SliderThumbSize, string> = {
	sm: "before:-inset-4",
	md: "before:-inset-3.5",
	lg: "before:-inset-2.5",
};

const controlHeightClasses: Record<SliderThumbSize, string> = {
	sm: "h-4",
	md: "h-5",
	lg: "h-8",
};

const trackHeightClasses: Record<SliderThumbSize, string> = {
	sm: "h-1",
	md: "h-1.5",
	lg: "h-2.5",
};

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
	(
		{
			"aria-describedby": ariaDescribedBy,
			"aria-invalid": ariaInvalid,
			className,
			controlClassName,
			getAriaValueText,
			indicatorClassName,
			label,
			labelHidden,
			showValue,
			thumbClassName,
			thumbSize = "md",
			trackClassName,
			...props
		},
		ref,
	) => {
		const val = props.value ?? props.defaultValue;
		const thumbCount = Array.isArray(val) ? val.length : 1;

		return (
			<Field.Root
				ref={ref}
				disabled={props.disabled}
				invalid={ariaInvalid}
				render={
					<BaseSlider.Root className={cn(sliderVariants({ className }))} {...props}>
						<div className={cn("flex items-center gap-4", labelHidden && !showValue && "sr-only")}>
							<BaseSlider.Label
								className={cn("flex-1 text-sm font-normal text-fg", labelHidden && showValue && "sr-only")}
							>
								{label}
							</BaseSlider.Label>
							{showValue && <BaseSlider.Value className="text-sm font-normal text-fg-muted tabular-nums" />}
						</div>
						<BaseSlider.Control
							className={cn("relative flex w-full items-center", controlHeightClasses[thumbSize], controlClassName)}
						>
							<BaseSlider.Track
								className={cn(
									"relative w-full overflow-hidden rounded-32",
									"bg-fill-weak ring-1 ring-inset ring-stroke-weak",
									"inset-shadow-sunken",
									trackHeightClasses[thumbSize],
									trackClassName,
								)}
							>
								<BaseSlider.Indicator
									className={cn(
										"absolute inset-y-0 h-auto rounded-32 bg-fill-selected min-w-1 inset-shadow-sunken",
										indicatorClassName,
									)}
								/>
							</BaseSlider.Track>
							{Array.from({ length: thumbCount }, (_, i) => (
								<BaseSlider.Thumb
									key={i}
									index={i}
									aria-describedby={ariaDescribedBy}
									getAriaValueText={getAriaValueText}
									className={cn(
										"relative rounded-full bg-surface",
										"border-2 border-stroke-action shadow-md",
										"[&:has(input:focus-visible)]:outline-2 [&:has(input:focus-visible)]:outline-offset-2 [&:has(input:focus-visible)]:outline-stroke-focus",
										"before:absolute before:content-['']",
										thumbSizeClasses[thumbSize],
										thumbHitAreaClasses[thumbSize],
										thumbClassName,
									)}
								/>
							))}
						</BaseSlider.Control>
					</BaseSlider.Root>
				}
			/>
		);
	},
);
Slider.displayName = "Slider";

export { Slider, sliderVariants };
export type { SliderProps, SliderThumbSize };
