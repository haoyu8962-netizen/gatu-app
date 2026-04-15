import { Field } from "@base-ui/react/field";
import { NumberField } from "@base-ui/react/number-field";
import { MinusIcon, PlusIcon, XCircleIcon } from "@phosphor-icons/react";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { DEFAULT_SIZE } from "./config";
import { cn } from "./utils";

const numberInputVariants = cva(
	["flex items-center w-full rounded-8", "bg-fill-inverse transition-colors duration-150"],
	{
		variants: {
			size: {
				xxs: "py-0.5 px-1.5 gap-1",
				xs: "py-1 px-2 gap-1",
				sm: "py-1.5 px-3 gap-1.5",
				md: "py-2 px-4 gap-2",
				lg: "py-3 px-4 gap-2",
			},
			invalid: {
				true: "border-2 border-stroke-error-strong bg-error-soft",
				false: "border border-stroke-strong hover:bg-fill-hover active:bg-fill-press",
			},
		},
		defaultVariants: {
			size: "sm",
			invalid: false,
		},
	},
);

const stepperButtonClasses = [
	"inline-flex items-center justify-center shrink-0 rounded-4",
	"text-icon hover:bg-fill-hover active:bg-fill-press",
	"transition-colors duration-150 cursor-pointer select-none",
	"focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stroke-focus",
	"data-disabled:opacity-40 data-disabled:cursor-not-allowed data-disabled:pointer-events-none",
].join(" ");

interface NumberInputProps extends Omit<VariantProps<typeof numberInputVariants>, "invalid"> {
	value?: number | null;
	defaultValue?: number | null;
	onValueChange?: (value: number | null, details: NumberField.Root.ChangeEventDetails) => void;
	onValueCommitted?: (value: number | null, details: NumberField.Root.CommitEventDetails) => void;
	min?: number;
	max?: number;
	step?: number | "any";
	smallStep?: number;
	largeStep?: number;
	format?: Intl.NumberFormatOptions;
	locale?: Intl.LocalesArgument;
	allowOutOfRange?: boolean;
	allowWheelScrub?: boolean;
	label?: string;
	hint?: string;
	error?: string;
	required?: boolean;
	optional?: boolean;
	disabled?: boolean;
	readOnly?: boolean;
	name?: string;
	id?: string;
	placeholder?: string;
	autoFocus?: boolean;
	selectOnFocus?: boolean;
	showStepper?: boolean;
	prefix?: React.ReactNode;
	iconLeft?: React.ReactNode;
	className?: string;
	size?: "xxs" | "xs" | "sm" | "md" | "lg";
	onBlur?: React.FocusEventHandler<HTMLInputElement>;
	onFocus?: React.FocusEventHandler<HTMLInputElement>;
}

const NumberInput = React.forwardRef<HTMLDivElement, NumberInputProps>(
	(
		{
			className,
			size: sizeProp,
			value,
			defaultValue,
			onValueChange,
			onValueCommitted,
			min,
			max,
			step,
			smallStep,
			largeStep,
			format,
			locale,
			allowOutOfRange,
			allowWheelScrub,
			label,
			hint,
			error,
			required,
			optional,
			disabled,
			readOnly,
			name,
			id,
			placeholder,
			autoFocus,
			selectOnFocus,
			showStepper = false,
			prefix,
			iconLeft,
			onBlur,
			onFocus,
		},
		ref,
	) => {
		const size = sizeProp ?? DEFAULT_SIZE;
		const isInvalid = !!error;
		const stepperSize = size === "lg" ? 20 : size === "md" ? 18 : size === "sm" ? 16 : size === "xs" ? 14 : 12;

		function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
			if (selectOnFocus) {
				e.target.select();
			}
			onFocus?.(e);
		}

		return (
			<Field.Root className="group flex flex-col gap-1 w-full" disabled={disabled} invalid={isInvalid} name={name}>
				{label && (
					<div className="flex flex-col">
						<Field.Label className="flex gap-1 items-baseline text-xs font-semibold cursor-default">
							<span className="text-fg group-data-disabled:text-fg-disabled">{label}</span>
							{required && <span className="text-fg-muted group-data-disabled:text-fg-disabled">*</span>}
							{optional && (
								<span className="text-xs text-fg-muted group-data-disabled:text-fg-disabled">(optional)</span>
							)}
						</Field.Label>
						{hint && <Field.Description className="text-xs text-fg-muted">{hint}</Field.Description>}
					</div>
				)}
				<NumberField.Root
					ref={ref}
					id={id}
					value={value}
					defaultValue={defaultValue ?? undefined}
					onValueChange={onValueChange}
					onValueCommitted={onValueCommitted}
					min={min}
					max={max}
					step={step}
					smallStep={smallStep}
					largeStep={largeStep}
					format={format}
					locale={locale}
					allowOutOfRange={allowOutOfRange}
					allowWheelScrub={allowWheelScrub}
					required={required}
					disabled={disabled}
					readOnly={readOnly}
					name={name}
				>
					<NumberField.Group
						className={cn(
							numberInputVariants({ size, invalid: isInvalid }),
							"group-data-disabled:border-stroke-disabled group-data-disabled:cursor-not-allowed",
							"focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-stroke-focus",
							className,
						)}
					>
						{showStepper && !readOnly && (
							<NumberField.Decrement className={stepperButtonClasses}>
								<MinusIcon size={stepperSize} weight="bold" />
							</NumberField.Decrement>
						)}
						{prefix && <span className="shrink-0 text-fg-muted group-data-disabled:text-fg-disabled">{prefix}</span>}
						{iconLeft && (
							<span className="shrink-0 text-icon opacity-80 group-data-disabled:text-icon-disabled">{iconLeft}</span>
						)}
						<NumberField.Input
							placeholder={placeholder}
							autoFocus={autoFocus}
							onFocus={handleFocus}
							onBlur={onBlur}
							className={cn(
								"flex-1 min-w-0 bg-transparent outline-none tabular-nums",
								size === "xxs"
									? "text-2xs"
									: size === "xs" || size === "sm"
										? "text-xs"
										: size === "lg"
											? "text-base"
											: "text-sm",
								"font-normal text-fg placeholder:text-fg-muted",
								"data-disabled:text-fg-disabled data-disabled:placeholder:text-fg-disabled data-disabled:cursor-not-allowed",
							)}
						/>
						{showStepper && !readOnly && (
							<NumberField.Increment className={stepperButtonClasses}>
								<PlusIcon size={stepperSize} weight="bold" />
							</NumberField.Increment>
						)}
					</NumberField.Group>
				</NumberField.Root>
				{error && (
					<Field.Error match className="flex items-center gap-2 py-1">
						<XCircleIcon size={24} weight="fill" className="shrink-0 text-icon-error" />
						<span className="text-xs font-semibold text-error">{error}</span>
					</Field.Error>
				)}
			</Field.Root>
		);
	},
);
NumberInput.displayName = "NumberInput";

export { NumberInput, numberInputVariants };
export type { NumberInputProps };
