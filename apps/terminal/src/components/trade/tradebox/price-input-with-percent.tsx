import { t } from "@lingui/core/macro";
import type { Icon } from "@phosphor-icons/react";
import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { formatUSD } from "@/lib/format";
import { isPositive } from "@/lib/trade/numbers";
import { getValueColorClass } from "@/lib/ui/value-color";

interface Props {
	label: string;
	icon: Icon;
	value: string;
	onChange: (value: string) => void;
	percentOptions: readonly number[];
	onPercentClick: (percent: number) => void;
	pnlValue: number | null;
	error?: string | null;
	disabled?: boolean;
	quickPercentDisabled?: boolean;
	isPercentDisabled?: (percent: number) => boolean;
	referencePrice: number;
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
}: Props) {
	return (
		<div className="min-w-0 space-y-1.5">
			<div className="flex min-w-0 items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1.5">
					<FieldLabel>{label}</FieldLabel>
					<Icon className="size-3 text-fg-muted" />
				</div>
				{pnlValue !== null && (
					<span
						className={cn("shrink-0 whitespace-nowrap text-right text-xs tabular-nums", getValueColorClass(pnlValue))}
					>
						{formatUSD(pnlValue, { signDisplay: "exceptZero" })}
					</span>
				)}
			</div>
			<div
				className={cn(
					"rounded-8 flex min-w-0 items-center overflow-hidden border bg-background transition-[border-color,box-shadow]",
					error
						? "border-stroke-error-strong ring-[2px] ring-stroke-error-strong/20"
						: "border-stroke-weak focus-within:border-stroke-focus focus-within:ring-[2px] focus-within:ring-stroke-focus/20",
				)}
			>
				<Input
					placeholder={t`Price`}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="min-w-0 flex-1 border-0 bg-transparent tabular-nums focus-visible:border-transparent focus-visible:ring-0"
					disabled={disabled}
				/>
				<div className="flex shrink-0 items-center gap-0.5 border-l border-stroke-weak/40 px-1.5">
					{percentOptions.map((p) => (
						<button
							key={p}
							type="button"
							onClick={() => onPercentClick(p)}
							disabled={disabled || quickPercentDisabled || !isPositive(referencePrice) || isPercentDisabled?.(p)}
							className="rounded-xs px-1.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-fill-weak hover:text-fg disabled:opacity-50"
							aria-label={t`Set to ${p}%`}
						>
							{p}%
						</button>
					))}
				</div>
			</div>
			{error && <div className="text-xs text-error">{error}</div>}
		</div>
	);
}
