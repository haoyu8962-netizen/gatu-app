import { useLingui } from "@lingui/react/macro";
import type { Icon } from "@phosphor-icons/react";
import { useId } from "react";
import { normalizeDecimalInputEvent } from "@/components/ui/decimal-input-event";
import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { formatUSD } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { isPositive } from "@/lib/trade/numbers";
import { getValueColorClass } from "@/lib/ui/value-color";

type FinancialDisplayValue = string | number;

interface LinkedReturnInput {
	ariaLabel: string;
	placeholder: string;
	unitLabel: string;
	value: string;
	onBlur?: () => void;
	onChange: (value: string) => void;
	onUnitToggle: () => void;
}

interface Props {
	label: string;
	icon: Icon;
	value: string;
	onChange: (value: string) => void;
	percentOptions: readonly number[];
	onPercentClick: (percent: number) => void;
	pnlValue: FinancialDisplayValue | null;
	error?: string | null;
	disabled?: boolean;
	quickPercentDisabled?: boolean;
	isPercentDisabled?: (percent: number) => boolean;
	referencePrice: FinancialDisplayValue;
	mobileTouchSafe?: boolean;
	linkedReturnInput?: LinkedReturnInput;
	formatPnlValue?: (value: FinancialDisplayValue) => string;
}

export function PriceInputWithPercent({
	label,
	icon: Icon,
	value,
	onChange,
	percentOptions,
	onPercentClick,
	pnlValue,
	error,
	disabled,
	quickPercentDisabled,
	isPercentDisabled,
	referencePrice,
	mobileTouchSafe = false,
	linkedReturnInput,
	formatPnlValue = (pnl) => formatUSD(pnl, { signDisplay: "exceptZero" }),
}: Props) {
	const { t } = useLingui();
	useNumberFormatRevision();
	const priceInputId = useId();
	const errorId = `${priceInputId}-error`;
	const inputFrameClassName = cn(
		"rounded-8 flex min-w-0 items-center overflow-hidden border bg-background transition-[border-color,box-shadow]",
		error
			? "border-stroke-error-strong ring-[2px] ring-stroke-error-strong/20"
			: "border-stroke-weak focus-within:border-stroke-focus focus-within:ring-[2px] focus-within:ring-stroke-focus/20",
	);

	const priceInput = (
		<div className={inputFrameClassName}>
			<Input
				id={priceInputId}
				aria-label={label}
				aria-describedby={error ? errorId : undefined}
				aria-invalid={Boolean(error)}
				inputMode="decimal"
				placeholder={t`Price`}
				value={value}
				onChange={(e) => onChange(normalizeDecimalInputEvent(e).target.value)}
				className={cn(
					"min-w-0 flex-1 border-0 bg-transparent tabular-nums focus-visible:border-transparent focus-visible:ring-0",
					mobileTouchSafe && "max-[1000px]:h-11",
				)}
				mobileSafe={mobileTouchSafe}
				disabled={disabled}
			/>
		</div>
	);

	const quickOptions = (
		<div className={cn("flex shrink-0 items-center gap-0.5", linkedReturnInput && "flex-wrap gap-1.5")}>
			{percentOptions.map((p) => (
				<button
					key={p}
					type="button"
					onClick={() => onPercentClick(p)}
					disabled={disabled || quickPercentDisabled || !isPositive(referencePrice) || isPercentDisabled?.(p)}
					className={cn(
						"rounded-xs px-1.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-fill-weak hover:text-fg disabled:opacity-50",
						mobileTouchSafe && "max-[1000px]:min-h-11 max-[1000px]:min-w-11 max-[1000px]:px-2",
					)}
					aria-label={t`Set to ${p}%`}
				>
					{p}%
				</button>
			))}
		</div>
	);

	return (
		<div className="min-w-0 space-y-1.5">
			<div className="flex min-w-0 items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1.5">
					<FieldLabel htmlFor={priceInputId}>{label}</FieldLabel>
					<Icon className="size-3 text-fg-muted" />
				</div>
				{pnlValue !== null && (
					<span
						className={cn("shrink-0 whitespace-nowrap text-right text-xs tabular-nums", getValueColorClass(pnlValue))}
					>
						{formatPnlValue(pnlValue)}
					</span>
				)}
			</div>
			{linkedReturnInput ? (
				<>
					<div className="grid min-w-0 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-2">
						{priceInput}
						<div className={inputFrameClassName}>
							<Input
								aria-label={linkedReturnInput.ariaLabel}
								aria-describedby={error ? errorId : undefined}
								aria-invalid={Boolean(error)}
								inputMode="decimal"
								placeholder={linkedReturnInput.placeholder}
								value={linkedReturnInput.value}
								onBlur={linkedReturnInput.onBlur}
								onChange={(event) => linkedReturnInput.onChange(normalizeDecimalInputEvent(event).target.value)}
								className={cn(
									"min-w-0 flex-1 border-0 bg-transparent tabular-nums focus-visible:border-transparent focus-visible:ring-0",
									mobileTouchSafe && "max-[1000px]:h-11",
								)}
								mobileSafe={mobileTouchSafe}
								disabled={disabled}
							/>
							<button
								type="button"
								onClick={linkedReturnInput.onUnitToggle}
								disabled={disabled}
								className={cn(
									"shrink-0 whitespace-nowrap border-l border-stroke-weak/40 px-2 text-xs font-semibold text-fg transition-colors hover:bg-fill-weak disabled:cursor-default disabled:opacity-50",
									mobileTouchSafe && "max-[1000px]:min-h-11",
								)}
								aria-label={t`Toggle profit and loss unit`}
								aria-pressed={linkedReturnInput.unitLabel === "%"}
							>
								{linkedReturnInput.unitLabel}
							</button>
						</div>
					</div>
					{quickOptions}
				</>
			) : (
				<div className={inputFrameClassName}>
					<Input
						id={priceInputId}
						aria-label={label}
						aria-describedby={error ? errorId : undefined}
						aria-invalid={Boolean(error)}
						inputMode="decimal"
						placeholder={t`Price`}
						value={value}
						onChange={(e) => onChange(normalizeDecimalInputEvent(e).target.value)}
						className={cn(
							"min-w-0 flex-1 border-0 bg-transparent tabular-nums focus-visible:border-transparent focus-visible:ring-0",
							mobileTouchSafe && "max-[1000px]:h-11",
						)}
						mobileSafe={mobileTouchSafe}
						disabled={disabled}
					/>
					<div className="border-l border-stroke-weak/40 px-1.5">{quickOptions}</div>
				</div>
			)}
			{error && (
				<div id={errorId} role="alert" className="text-xs text-error">
					{error}
				</div>
			)}
		</div>
	);
}
