import { t } from "@lingui/core/macro";
import { positionTableInlineActionClass } from "./position-table-styles";

interface Props {
	canClose: boolean;
	canReverse: boolean;
	isRowClosing: boolean;
	onMarketClose: () => void;
	onLimitClose: () => void;
	onReverse: () => void;
}

export function PositionInlineActions({
	canClose,
	canReverse,
	isRowClosing,
	onMarketClose,
	onLimitClose,
	onReverse,
}: Props) {
	return (
		<div className="flex items-center justify-end gap-2 whitespace-nowrap">
			<button
				type="button"
				disabled={!canClose || isRowClosing}
				onClick={onLimitClose}
				aria-label={t`Limit Close`}
				className={positionTableInlineActionClass}
			>
				{t({ message: "Limit", context: "Order type" })}
			</button>
			<button
				type="button"
				disabled={!canClose || isRowClosing}
				onClick={onMarketClose}
				aria-label={t`Market Close`}
				aria-busy={isRowClosing}
				className={positionTableInlineActionClass}
			>
				{t({ message: "Market", context: "Order type" })}
			</button>
			<button
				type="button"
				disabled={!canReverse || isRowClosing}
				onClick={onReverse}
				aria-label={t`Reverse Position`}
				className={positionTableInlineActionClass}
			>
				{t({ message: "Reverse", context: "Position action" })}
			</button>
		</div>
	);
}
