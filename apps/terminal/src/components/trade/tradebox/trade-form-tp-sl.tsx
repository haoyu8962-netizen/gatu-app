import { useOrderEntryActions, useOrderSide, useSlPrice, useTpPrice } from "@/stores/use-order-entry-store";
import { TpSlSection } from "./tp-sl-section";

interface Props {
	referencePrice: number;
	size: number;
	szDecimals: number;
	disabled: boolean;
}

export function TradeFormTpSl({ referencePrice, size, szDecimals, disabled }: Props) {
	const side = useOrderSide();
	const tpPriceInput = useTpPrice();
	const slPriceInput = useSlPrice();
	const { setTpPrice, setSlPrice } = useOrderEntryActions();

	return (
		<TpSlSection
			side={side}
			referencePrice={referencePrice}
			size={size}
			szDecimals={szDecimals}
			tpPrice={tpPriceInput}
			slPrice={slPriceInput}
			onTpPriceChange={setTpPrice}
			onSlPriceChange={setSlPrice}
			disabled={disabled}
		/>
	);
}
