import { t } from "@lingui/core/macro";
import type { Icon } from "@phosphor-icons/react";
import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { formatUSD } from "@/lib/format";
import { getValueColorClass, isPositive } from "@/lib/trade/numbers";

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
	referencePrice,
}: Props) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<FieldLabel>{label}</FieldLabel>
					<Icon className="size-3 text-text-weak" />
				</div>
				{pnlValue !== null && (
					<span className={cn("text-xs tabular-nums", getValueColorClass(pnlValue))}>
						{formatUSD(pnlValue, { signDisplay: "exceptZero" })}
					</span>
				)}
			</div>
			<div
				className={cn(
					"flex items-center rounded-8 border bg-bg-base overflow-hidden transition-[border-color,box-shadow]",
					error
						? "border-stroke-error-strong ring-[2px] ring-stroke-error-strong/20"
						: "border-stroke-weak focus-within:border-stroke-focus focus-within:ring-[2px] focus-within:ring-stroke-focus/20",
				)}
			>
				<Input
					placeholder={t`Price`}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="flex-1 border-0 focus-visible:ring-0 focus-visible:border-transparent tabular-nums bg-transparent"
					disabled={disabled}
				/>
				<div className="flex items-center gap-0.5 px-1.5 border-l border-stroke-weak/40">
					{percentOptions.map((p) => (
						<button
							key={p}
							type="button"
							onClick={() => onPercentClick(p)}
							disabled={disabled || !isPositive(referencePrice)}
							className="px-1.5 py-1 text-xs font-medium text-text-weak hover:text-text-strong hover:bg-fill-weak rounded-xs transition-colors disabled:opacity-50"
							aria-label={t`Set to ${p}%`}
						>
							{p}%
						</button>
					))}
				</div>
			</div>
			{error && <div className="text-xs text-text-error">{error}</div>}
		</div>
	);
}
