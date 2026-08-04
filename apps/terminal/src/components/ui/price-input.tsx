import { useLingui } from "@lingui/react/macro";
import { CrosshairIcon } from "@phosphor-icons/react";
import type React from "react";
import { szDecimalsToPriceDecimals } from "@/lib/format";
import { type Numeric, toBig, toFixed } from "@/lib/trade/numbers";
import { NumberInput } from "./number-input";

const PRICE_INPUT_DEFAULT_DECIMALS = 4;

interface Props extends Omit<React.ComponentPropsWithoutRef<typeof NumberInput>, "maxLabel" | "onMaxClick"> {
	midPrice?: Numeric;
	szDecimals?: number;
	marketType?: "perp" | "spot";
	onMidClick?: (formattedPrice: string) => void;
}

export function PriceInput({ midPrice, szDecimals, marketType, onMidClick, labelValue, ...props }: Props) {
	const { t } = useLingui();
	const parsedMid = toBig(midPrice);
	const hasPositiveMid = parsedMid?.gt(0) ?? false;
	const hasMid = hasPositiveMid && onMidClick != null;
	const priceDecimals = szDecimalsToPriceDecimals(szDecimals ?? PRICE_INPUT_DEFAULT_DECIMALS, marketType);
	const formattedMid = hasPositiveMid ? toFixed(parsedMid, priceDecimals) : undefined;
	function handleMidClick() {
		if (!onMidClick || !formattedMid) return;
		onMidClick(formattedMid);
	}

	return (
		<NumberInput
			{...props}
			labelValue={labelValue ?? formattedMid}
			maxLabel={
				hasMid ? (
					<span className="flex items-center gap-1">
						<CrosshairIcon className="size-3" />
						{t`Mid`}
					</span>
				) : undefined
			}
			onMaxClick={hasMid ? handleMidClick : undefined}
		/>
	);
}
