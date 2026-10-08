import { CaretLeftIcon } from "@phosphor-icons/react";
import { ButtonIcon } from "@sairn/ui";

interface Props {
	disabled?: boolean;
	label: string;
	onClick: () => void;
}

export function renderFundsModalBackButton({ disabled, label, onClick }: Props) {
	return (
		<ButtonIcon
			type="button"
			variant="ghost"
			intent="neutral"
			size="sm"
			onClick={onClick}
			disabled={disabled}
			aria-label={label}
			className="absolute top-5 left-4 z-10 rounded-16 text-trading-panel-muted hover:bg-transparent not-data-disabled:hover:bg-trading-panel-hover not-data-disabled:hover:text-trading-panel-fg min-[1001px]:top-6 min-[1001px]:left-6"
		>
			<CaretLeftIcon className="size-4 rtl:rotate-180" aria-hidden="true" />
		</ButtonIcon>
	);
}
