import { formatPriceForOrder } from "@/domain/trade/orders";
import { type Numeric, toBig } from "@/lib/trade/numbers";
import { validateSlPrice, validateTpPrice } from "@/lib/trade/tpsl";
import type { Side } from "@/lib/trade/types";

interface PriceFormat {
	assetId: number | null;
	szDecimals: number;
}

interface TpSlPriceValidationInput extends PriceFormat {
	referencePrice: Numeric;
	tpPrice: Numeric;
	slPrice: Numeric;
	side: Side;
}

export interface TpSlPriceErrors {
	tp: boolean;
	sl: boolean;
}

export function normalizeTpSlPrice(value: Numeric, { assetId, szDecimals }: PriceFormat): string | null {
	if (assetId === null) return null;
	const parsed = toBig(value);
	if (!parsed?.gt(0)) return null;
	const normalized = formatPriceForOrder(parsed, { assetId, szDecimals });
	return toBig(normalized)?.gt(0) ? normalized : null;
}

export function getTpSlPriceErrors(input: TpSlPriceValidationInput): TpSlPriceErrors {
	const reference = normalizeTpSlPrice(input.referencePrice, input);
	const tp = normalizeTpSlPrice(input.tpPrice, input);
	const sl = normalizeTpSlPrice(input.slPrice, input);
	return {
		tp: reference !== null && tp !== null && !validateTpPrice(reference, tp, input.side),
		sl: reference !== null && sl !== null && !validateSlPrice(reference, sl, input.side),
	};
}
