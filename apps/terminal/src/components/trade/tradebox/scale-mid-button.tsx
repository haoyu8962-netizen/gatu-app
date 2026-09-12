import { useLingui } from "@lingui/react/macro";

interface Props {
	disabled: boolean;
	value: string | undefined;
	onSelect: (formattedPrice: string) => void;
}

export function ScaleMidButton({ disabled, value, onSelect }: Props) {
	const { t } = useLingui();
	return (
		<button
			type="button"
			onClick={() => {
				if (value != null) onSelect(value);
			}}
			disabled={disabled || value == null}
			aria-label={value == null ? t`Use mid price` : `${t`Use mid price`} ${value}`}
			className="relative ms-1 inline-flex h-8 min-w-11 shrink-0 items-center justify-center whitespace-nowrap text-xs font-semibold text-trading-panel-success transition-colors after:absolute after:inset-0 after:content-[''] hover:text-trading-panel-success/80 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{t`Mid`}
		</button>
	);
}
