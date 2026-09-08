import { useLingui } from "@lingui/react/macro";

interface Props {
	disabled: boolean;
	value: string;
	onSelect: (formattedPrice: string) => void;
}

export function ScaleMidButton({ disabled, value, onSelect }: Props) {
	const { t } = useLingui();
	return (
		<button
			type="button"
			onClick={() => onSelect(value)}
			disabled={disabled}
			aria-label={`${t`Use mid price`} ${value}`}
			className="relative ml-1 h-8 shrink-0 whitespace-nowrap text-xs font-semibold text-trading-panel-success transition-colors after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:text-trading-panel-success/80 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{t`Mid`}
		</button>
	);
}
