/**
 * String-based numeric input for the trade UI.
 *
 * This does NOT use `NumberInput` from `@gatu/ui`. The package primitive
 * exposes a `number | null` value via `onValueChange` (built on @base-ui NumberField)
 * and wraps the input in `Field.Root` with label/hint/error slots. The tradebox
 * callers (size/price/TP/SL/leverage/trigger inputs) keep Hyperliquid price/size
 * strings end-to-end: API returns strings with exact decimals, they flow through
 * `onChange(string)` unchanged, are validated for decimal limits, and converted to
 * `Big()` only when math is required. Converting to `number` here would lose
 * precision (HL's sz/px can have up to 8 decimals). See `rules/hyperliquid.md`.
 *
 * The synthetic change event below enables the ArrowUp/ArrowDown keyboard stepper
 * without rewriting every caller's `onChange(e)` handler.
 */
import { Input as BaseInput } from "@base-ui/react/input";
import Big from "big.js";
import type * as React from "react";
import { useCallback, useId } from "react";
import { cn } from "@/lib/cn";
import { labelTypographyClass } from "./field-label";
import { getInputClassName, type InputSize } from "./input";

/**
 * Validates numeric input string format.
 * Pattern breakdown:
 *   ^        - start of string
 *   -?       - optional minus sign (only if allowNegative)
 *   \d*      - zero or more digits before decimal
 *   \.?      - optional decimal point (only if allowDecimals)
 *   \d*      - zero or more digits after decimal
 *   $        - end of string
 */
function isValidNumberFormat(value: string, allowDecimals: boolean, allowNegative: boolean): boolean {
	const pattern = allowDecimals
		? allowNegative
			? /^-?\d*\.?\d*$/
			: /^\d*\.?\d*$/
		: allowNegative
			? /^-?\d*$/
			: /^\d*$/;
	return pattern.test(value);
}

function exceedsDecimalLimit(value: string, maxDecimals: number | undefined): boolean {
	if (maxDecimals === undefined) return false;
	const dotIndex = value.indexOf(".");
	return dotIndex !== -1 && value.length - dotIndex - 1 > maxDecimals;
}

function parseBigOrNull(value: string | number): Big | null {
	try {
		return new Big(String(value));
	} catch {
		return null;
	}
}

function roundLikeMath(value: Big): Big {
	const integer = value.round(0, Big.roundDown);
	const fraction = value.minus(integer).abs();

	if (value.gte(0)) return fraction.gte("0.5") ? integer.plus(1) : integer;
	return fraction.gt("0.5") ? integer.minus(1) : integer;
}

interface StepValueInput {
	allowNegative: boolean;
	currentValue: string;
	direction: "down" | "up";
	max: number | undefined;
	min: number | undefined;
	step: number;
	useDecimals: boolean;
}

function resolveSteppedValue({
	allowNegative,
	currentValue,
	direction,
	max,
	min,
	step,
	useDecimals,
}: StepValueInput): string {
	const current = parseBigOrNull(currentValue) ?? new Big(0);
	const stepValue = parseBigOrNull(step) ?? new Big(0);
	let next = direction === "up" ? current.plus(stepValue) : current.minus(stepValue);
	const minValue = min === undefined ? null : parseBigOrNull(min);
	const maxValue = max === undefined ? null : parseBigOrNull(max);

	if (minValue && next.lt(minValue)) next = minValue;
	if (maxValue && next.gt(maxValue)) next = maxValue;
	if (!allowNegative && next.lt(0)) next = new Big(0);
	if (!useDecimals) next = roundLikeMath(next);

	return next.toFixed();
}

interface Props extends Omit<React.ComponentProps<"input">, "type" | "onChange" | "min" | "max" | "step"> {
	inputSize?: InputSize;
	mobileSafe?: boolean;
	allowDecimals?: boolean;
	allowNegative?: boolean;
	maxAllowedDecimals?: number;
	min?: number;
	max?: number;
	step?: number;
	maxLabel?: React.ReactNode;
	onMaxClick?: () => void;
	suffix?: React.ReactNode;
	suffixClassName?: string;
	onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
	label?: string;
	labelValue?: React.ReactNode;
	onLabelValueClick?: () => void;
}

export function NumberInput({
	className,
	inputSize = "default",
	mobileSafe,
	allowDecimals = true,
	allowNegative = false,
	maxAllowedDecimals,
	min,
	max,
	step = 1,
	maxLabel,
	onMaxClick,
	suffix,
	suffixClassName,
	value,
	onChange,
	onKeyDown,
	disabled,
	id,
	label,
	labelValue,
	onLabelValueClick,
	...props
}: Props) {
	const generatedInputId = useId();
	const inputId = id ?? generatedInputId;
	const effectiveAllowDecimals = allowDecimals && (maxAllowedDecimals === undefined || maxAllowedDecimals > 0);
	const hasMax = maxLabel != null && onMaxClick != null;
	const hasSuffix = !hasMax && suffix != null;

	const createSyntheticEvent = useCallback(
		(input: HTMLInputElement, newValue: string): React.ChangeEvent<HTMLInputElement> => {
			const nativeEvent = new Event("change", { bubbles: true });
			Object.defineProperty(nativeEvent, "target", { writable: false, value: { ...input, value: newValue } });
			return {
				...nativeEvent,
				target: { ...input, value: newValue } as EventTarget & HTMLInputElement,
				currentTarget: { ...input, value: newValue } as EventTarget & HTMLInputElement,
				nativeEvent,
				isDefaultPrevented: () => false,
				isPropagationStopped: () => false,
				persist: () => {},
			} as React.ChangeEvent<HTMLInputElement>;
		},
		[],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "ArrowUp" || e.key === "ArrowDown") {
				e.preventDefault();
				const input = e.currentTarget;
				const newValueStr = resolveSteppedValue({
					allowNegative,
					currentValue: input.value,
					direction: e.key === "ArrowUp" ? "up" : "down",
					max,
					min,
					step,
					useDecimals: effectiveAllowDecimals,
				});
				const syntheticEvent = createSyntheticEvent(input, newValueStr);
				onChange?.(syntheticEvent);
				onKeyDown?.(e);
				return;
			}

			const allowedKeys = ["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"];

			if (allowedKeys.includes(e.key)) {
				onKeyDown?.(e);
				return;
			}

			if ((e.ctrlKey || e.metaKey) && ["a", "c", "v", "x", "z"].includes(e.key.toLowerCase())) {
				onKeyDown?.(e);
				return;
			}

			const isDigit = /^[0-9]$/.test(e.key);
			const isDecimal = e.key === "." && effectiveAllowDecimals;
			const isMinus = e.key === "-" && allowNegative;

			if (!isDigit && !isDecimal && !isMinus) {
				e.preventDefault();
				return;
			}

			const inputValue = e.currentTarget.value;
			const selectionStart = e.currentTarget.selectionStart ?? 0;

			if (isDecimal && inputValue.includes(".")) {
				e.preventDefault();
				return;
			}

			if (isMinus && (selectionStart !== 0 || inputValue.includes("-"))) {
				e.preventDefault();
				return;
			}

			onKeyDown?.(e);
		},
		[effectiveAllowDecimals, allowNegative, min, max, step, onChange, onKeyDown, createSyntheticEvent],
	);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const inputValue = e.target.value;

			const isIntermediateState =
				inputValue === "" ||
				inputValue === "-" ||
				(effectiveAllowDecimals && (inputValue === "." || inputValue === "-."));

			if (isIntermediateState) {
				onChange?.(e);
				return;
			}

			if (!isValidNumberFormat(inputValue, effectiveAllowDecimals, allowNegative)) return;
			if (exceedsDecimalLimit(inputValue, maxAllowedDecimals)) return;

			onChange?.(e);
		},
		[effectiveAllowDecimals, allowNegative, maxAllowedDecimals, onChange],
	);

	const inputEl = (
		<BaseInput
			id={inputId}
			type="text"
			inputMode={effectiveAllowDecimals ? "decimal" : "numeric"}
			data-slot="input"
			data-size={inputSize}
			value={value}
			disabled={disabled}
			className={getInputClassName(
				inputSize,
				cn("w-full", hasMax && "pr-20", hasSuffix && "pr-7", className),
				mobileSafe,
			)}
			onKeyDown={handleKeyDown}
			onChange={handleChange}
			{...props}
		/>
	);

	function renderInputWithAction() {
		if (hasMax) {
			return (
				<div className="relative min-w-0">
					{inputEl}
					<button
						type="button"
						onClick={onMaxClick}
						disabled={disabled}
						className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-signal hover:text-signal-hover active:scale-90 active:opacity-70 transition-[color,opacity,transform] whitespace-nowrap tabular-nums disabled:opacity-50 disabled:pointer-events-none"
					>
						{maxLabel}
					</button>
				</div>
			);
		}
		if (hasSuffix) {
			return (
				<div className="relative min-w-0">
					{inputEl}
					<span
						className={cn(
							"pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-xs text-fg-muted tabular-nums",
							suffixClassName,
						)}
					>
						{suffix}
					</span>
				</div>
			);
		}
		return inputEl;
	}

	const inputWithAction = renderInputWithAction();

	if (!label) return inputWithAction;

	return (
		<div>
			<div className="mb-1.5 flex items-center justify-between">
				<label className={labelTypographyClass} htmlFor={inputId}>
					{label}
				</label>
				{labelValue != null && onLabelValueClick ? (
					<button
						type="button"
						onClick={onLabelValueClick}
						disabled={disabled}
						className="text-3xs text-fg-muted tabular-nums leading-none hover:text-fg transition-colors cursor-pointer disabled:pointer-events-none"
					>
						{labelValue}
					</button>
				) : labelValue != null ? (
					<span className="text-3xs text-fg-muted tabular-nums leading-none">{labelValue}</span>
				) : null}
			</div>
			{inputWithAction}
		</div>
	);
}
