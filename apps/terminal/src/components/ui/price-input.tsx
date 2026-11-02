import { useLingui } from "@lingui/react/macro";
import { CrosshairIcon } from "@phosphor-icons/react";
import type React from "react";
import { formatPriceForInput } from "@/domain/trade/orders";
import { szDecimalsToPriceDecimals } from "@/lib/format";
import { formatPriceAtDisplayDecimals, type Numeric, toBig } from "@/lib/trade/numbers";
import { NumberInput } from "./number-input";

const PRICE_INPUT_DEFAULT_DECIMALS = 4;

export function getFormattedMidPrice(
	midPrice: Numeric | undefined,
	szDecimals: number | undefined,
	marketType: "perp" | "spot" | undefined,
	assetId?: number,
): string | undefined {
	const parsedMid = toBig(midPrice);
	if (!parsedMid?.gt(0)) return undefined;
	if (typeof assetId === "number" && typeof szDecimals === "number") {
		return formatPriceForInput(parsedMid, { assetId, szDecimals });
	}
	const priceDecimals = szDecimalsToPriceDecimals(szDecimals ?? PRICE_INPUT_DEFAULT_DECIMALS, marketType);
	return formatPriceAtDisplayDecimals(parsedMid, priceDecimals);
}

interface Props extends Omit<React.ComponentPropsWithoutRef<typeof NumberInput>, "maxLabel" | "onMaxClick"> {
	midPrice?: Numeric;
	szDecimals?: number;
	marketType?: "perp" | "spot";
	assetId?: number;
	onMidClick?: (formattedPrice: string) => void;
}

export function PriceInput({ midPrice, szDecimals, marketType, assetId, onMidClick, labelValue, ...props }: Props) {
	const { t } = useLingui();
	const formattedMid = getFormattedMidPrice(midPrice, szDecimals, marketType, assetId);
	const hasMid = formattedMid != null && onMidClick != null;
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
