import { Button, Dropdown } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { ArrowsClockwiseIcon, LightningIcon, TagIcon } from "@phosphor-icons/react";
import { positionTableInlineActionClass } from "./position-table-styles";

interface Props {
	canClose: boolean;
	isRowClosing: boolean;
	onMarketClose: () => void;
	onLimitClose: () => void;
	onReverse: () => void;
}

export function PositionActionsDropdown({ canClose, isRowClosing, onMarketClose, onLimitClose, onReverse }: Props) {
	return (
		<>
			<div className="hidden items-center justify-start gap-0.5 whitespace-nowrap min-[1180px]:flex">
				<Button
					type="button"
					variant="ghost"
					intent="brand"
					size="xxs"
					disabled={!canClose || isRowClosing}
					onClick={onLimitClose}
					className={positionTableInlineActionClass}
				>
					{t({ message: "Limit", context: "Order type" })}
				</Button>
				<Button
					type="button"
					variant="ghost"
					intent="brand"
					size="xxs"
					disabled={!canClose || isRowClosing}
					onClick={onMarketClose}
					className={positionTableInlineActionClass}
				>
					{isRowClosing ? t`Closing...` : t({ message: "Market", context: "Order type" })}
				</Button>
				<Button
					type="button"
					variant="ghost"
					intent="brand"
					size="xxs"
					disabled={!canClose || isRowClosing}
					onClick={onReverse}
					className={positionTableInlineActionClass}
				>
					{t`Reverse`}
				</Button>
			</div>
			<div className="min-[1180px]:hidden">
				<Dropdown
					className="flex justify-start text-xs text-fg-muted"
					triggerVariant="minimal"
					triggerClassName="font-medium"
					triggerAriaLabel={t`Position close actions`}
					trigger={isRowClosing ? t`Closing...` : t`Close`}
					disabled={!canClose || isRowClosing}
					align="start"
					groups={[
						{
							items: [
								{
									label: t`Market Close`,
									icon: <LightningIcon className="size-3.5" />,
									onSelect: onMarketClose,
								},
								{
									label: t`Limit Close`,
									icon: <TagIcon className="size-3.5" />,
									onSelect: onLimitClose,
								},
							],
						},
						{
							items: [
								{
									label: t`Reverse`,
									icon: <ArrowsClockwiseIcon className="size-3.5" />,
									onSelect: onReverse,
								},
							],
						},
					]}
				/>
			</div>
		</>
	);
}
