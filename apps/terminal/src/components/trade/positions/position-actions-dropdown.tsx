import { Button, Dropdown } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { DotsThreeIcon } from "@phosphor-icons/react";
import { positionTableInlineActionClass } from "./position-table-styles";

interface Props {
	canClose: boolean;
	canManage: boolean;
	canReverse: boolean;
	isIsolated: boolean;
	isRowClosing: boolean;
	onMarketClose: () => void;
	onLimitClose: () => void;
	onAdjustMargin: () => void;
	onOpenTpSl: () => void;
	onReverse: () => void;
}

export function PositionActionsDropdown({
	canClose,
	canManage,
	canReverse,
	isIsolated,
	isRowClosing,
	onMarketClose,
	onLimitClose,
	onAdjustMargin,
	onOpenTpSl,
	onReverse,
}: Props) {
	return (
		<div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
			<Button
				type="button"
				variant="outline"
				intent="error"
				size="xxs"
				disabled={!canClose || isRowClosing}
				onClick={onMarketClose}
				className={`${positionTableInlineActionClass} border-stroke-error-weak text-market-close-danger transition-all duration-[120ms] hover:border-market-close-danger hover:bg-market-close-danger hover:text-market-close-danger-text focus-visible:!outline-market-close-focus`}
			>
				{isRowClosing ? t`Closing...` : t`Market Close`}
			</Button>
			<Dropdown
				size="xxs"
				className="flex shrink-0 text-market-close-subtle"
				triggerVariant="minimal"
				triggerClassName="size-[26px] rounded-[7px] p-0 transition-all duration-[120ms] hover:bg-market-close-hover focus-visible:!outline-market-close-focus"
				triggerAriaLabel={t`More position actions`}
				trigger={<DotsThreeIcon className="size-[18px]" weight="bold" aria-hidden="true" />}
				hideCaret
				disabled={!canManage || isRowClosing}
				align="end"
				popupClassName="min-w-32 rounded-[10px] border-market-close-stroke-card bg-overlay p-1.5 shadow-overlay"
				items={[
					{
						label: t`Limit Close`,
						disabled: !canClose,
						onSelect: onLimitClose,
					},
					...(isIsolated
						? [
								{
									label: t`Adjust Margin`,
									onSelect: onAdjustMargin,
								},
							]
						: []),
					{
						label: t`Set TP/SL`,
						onSelect: onOpenTpSl,
					},
					{
						label: t`Reverse Position`,
						danger: true,
						disabled: !canReverse,
						onSelect: onReverse,
					},
				]}
			/>
		</div>
	);
}
