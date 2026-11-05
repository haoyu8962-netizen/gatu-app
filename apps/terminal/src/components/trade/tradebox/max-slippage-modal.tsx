import { useLingui } from "@lingui/react/macro";
import { AdaptiveModal, Button, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@sairn/ui";
import { type ChangeEvent, useId, useState } from "react";
import { NumberInput } from "@/components/ui/number-input";
import {
	MARKET_ORDER_SLIPPAGE_MAX_PERCENT,
	MARKET_ORDER_SLIPPAGE_MIN_PERCENT,
	TRIGGER_MARKET_SLIPPAGE_BPS,
} from "@/config/trade";
import { useNumberFormat } from "@/lib/format";
import { useGlobalSettingsActions, useMarketOrderSlippagePercent } from "@/stores/use-global-settings-store";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	presentation: "modal" | "drawer";
}

export function MaxSlippageModal({ open, onOpenChange, presentation }: Props) {
	const { t } = useLingui();
	const { formatNumber } = useNumberFormat();
	const slippagePercent = useMarketOrderSlippagePercent();
	const { setMarketOrderSlippagePercent } = useGlobalSettingsActions();
	const rangeId = useId();
	const [draft, setDraft] = useState<string | null>(null);
	const inputValue = draft ?? String(slippagePercent);
	const parsedSlippage = Number(inputValue);
	const isValid =
		inputValue.trim() !== "" &&
		Number.isFinite(parsedSlippage) &&
		parsedSlippage >= MARKET_ORDER_SLIPPAGE_MIN_PERCENT &&
		parsedSlippage <= MARKET_ORDER_SLIPPAGE_MAX_PERCENT;
	const triggerSlippage = formatNumber(TRIGGER_MARKET_SLIPPAGE_BPS / 100);
	const minSlippage = formatNumber(MARKET_ORDER_SLIPPAGE_MIN_PERCENT);
	const maxSlippage = formatNumber(MARKET_ORDER_SLIPPAGE_MAX_PERCENT);

	function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
		setDraft(event.target.value);
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen) setDraft(null);
		onOpenChange(nextOpen);
	}

	function handleConfirm() {
		if (!open || !isValid) return;
		setMarketOrderSlippagePercent(parsedSlippage);
		handleOpenChange(false);
	}

	return (
		<AdaptiveModal
			open={open}
			onOpenChange={handleOpenChange}
			presentation={presentation}
			size="sm"
			closeLabel={t`Close`}
		>
			<ModalHeader>
				<ModalTitle>{t`Adjust Max Slippage`}</ModalTitle>
				<ModalDescription>
					{t`Max slippage applies to market orders placed from the order form and to closing or reversing a position at market. Market TP/SL orders use a max slippage of ${triggerSlippage}%.`}
				</ModalDescription>
			</ModalHeader>
			<ModalContent className="space-y-1.5">
				<div className="flex items-center gap-2">
					<NumberInput
						value={inputValue}
						onChange={handleInputChange}
						min={MARKET_ORDER_SLIPPAGE_MIN_PERCENT}
						max={MARKET_ORDER_SLIPPAGE_MAX_PERCENT}
						maxAllowedDecimals={2}
						mobileSafe
						aria-label={t`Max slippage`}
						aria-describedby={rangeId}
						aria-invalid={!isValid || undefined}
						className="flex-1 text-right tabular-nums"
					/>
					<span className="text-sm text-fg-muted">%</span>
				</div>
				<p id={rangeId} className="text-2xs tabular-nums text-fg-muted">
					{minSlippage}% – {maxSlippage}%
				</p>
			</ModalContent>
			<ModalFooter>
				<Button className="w-full" disabled={!open || !isValid} onClick={handleConfirm}>
					{t`Confirm`}
				</Button>
			</ModalFooter>
		</AdaptiveModal>
	);
}
