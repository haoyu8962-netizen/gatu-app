import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { szDecimalsToPriceDecimals } from "@/lib/format";
import { isPositive, toBig, toNumber } from "@/lib/trade/numbers";
import {
	calculateEstimatedPnlExact,
	calculateRoeMagnitudeFromPriceExact,
	calculateSlPriceFromRoe,
	calculateTargetPriceFromPnl,
	calculateTpPriceFromRoe,
	validateSlPrice,
	validateTpPrice,
} from "@/lib/trade/tpsl";
import { useOrderEntryActions, useOrderSide, useSlPrice, useTpPrice } from "@/stores/use-order-entry-store";
import { TpSlSection } from "./tp-sl-section";

interface Props {
	referencePrice: number;
	size: number;
	szDecimals: number;
	disabled: boolean;
	leverage?: number;
	mobileTouchSafe?: boolean;
}

type ReturnUnit = "$" | "%";
type TpSlKind = "tp" | "sl";

export function TradeFormTpSl({ referencePrice, size, szDecimals, disabled, leverage, mobileTouchSafe }: Props) {
	const { t } = useLingui();
	const side = useOrderSide();
	const tpPriceInput = useTpPrice();
	const slPriceInput = useSlPrice();
	const { setTpPrice, setSlPrice } = useOrderEntryActions();

	const [tpUnit, setTpUnit] = useState<ReturnUnit>("%");
	const [slUnit, setSlUnit] = useState<ReturnUnit>("%");
	const [tpReturnDraft, setTpReturnDraft] = useState<string | null>(null);
	const [slReturnDraft, setSlReturnDraft] = useState<string | null>(null);

	const priceDecimals = szDecimalsToPriceDecimals(szDecimals);

	function getUnit(kind: TpSlKind): ReturnUnit {
		return kind === "tp" ? tpUnit : slUnit;
	}

	function canLinkReturn(kind: TpSlKind): boolean {
		if (!isPositive(referencePrice)) return false;
		if (getUnit(kind) === "%") return isPositive(leverage);
		return isPositive(size);
	}

	function isDirectionValid(kind: TpSlKind, price: string): boolean {
		if (kind === "tp") return validateTpPrice(referencePrice, price, side);
		return validateSlPrice(referencePrice, price, side);
	}

	function formatReturnMagnitude(value: string | number | null, fractionDigits: number): string {
		const parsed = toBig(value)?.abs();
		return parsed?.gt(0) ? parsed.round(fractionDigits).toString() : "";
	}

	function getReturnValue(kind: TpSlKind): string {
		const draft = kind === "tp" ? tpReturnDraft : slReturnDraft;
		if (draft !== null) return draft;
		const price = kind === "tp" ? tpPriceInput : slPriceInput;
		if (!isPositive(toNumber(price)) || !isDirectionValid(kind, price)) return "";
		if (getUnit(kind) === "%") {
			return formatReturnMagnitude(calculateRoeMagnitudeFromPriceExact(referencePrice, price, side, kind, leverage), 1);
		}
		return formatReturnMagnitude(calculateEstimatedPnlExact({ referencePrice, side, size }, price), 2);
	}

	function priceFromReturn(kind: TpSlKind, magnitude: number): string | null {
		let target: string | null;
		if (getUnit(kind) === "%") {
			const fromRoe = kind === "tp" ? calculateTpPriceFromRoe : calculateSlPriceFromRoe;
			target = fromRoe(referencePrice, side, magnitude, leverage, priceDecimals);
		} else {
			target = calculateTargetPriceFromPnl(referencePrice, side, size, magnitude, kind, priceDecimals);
		}
		if (target !== null && toBig(target)?.eq(toBig(referencePrice) ?? 0)) return null;
		return target;
	}

	function handleReturnChange(kind: TpSlKind, value: string) {
		if (!/^\d*\.?\d*$/.test(value)) return;
		const setDraft = kind === "tp" ? setTpReturnDraft : setSlReturnDraft;
		const setPrice = kind === "tp" ? setTpPrice : setSlPrice;
		setDraft(value);
		const magnitude = Number.parseFloat(value);
		if (!Number.isFinite(magnitude) || magnitude <= 0) {
			setPrice("");
			return;
		}
		const target = priceFromReturn(kind, magnitude);
		if (target !== null) setPrice(target);
	}

	function handleReturnBlur(kind: TpSlKind) {
		if (kind === "tp") setTpReturnDraft(null);
		else setSlReturnDraft(null);
	}

	function handleUnitToggle(kind: TpSlKind) {
		if (kind === "tp") {
			setTpUnit((current) => (current === "%" ? "$" : "%"));
			setTpReturnDraft(null);
		} else {
			setSlUnit((current) => (current === "%" ? "$" : "%"));
			setSlReturnDraft(null);
		}
	}

	function handleTpPriceChange(value: string) {
		setTpReturnDraft(null);
		setTpPrice(value);
	}

	function handleSlPriceChange(value: string) {
		setSlReturnDraft(null);
		setSlPrice(value);
	}

	function getTpError(): string | null {
		const tpPriceNum = toNumber(tpPriceInput);
		if (!isPositive(tpPriceNum) || !isPositive(referencePrice)) return null;
		if (validateTpPrice(referencePrice, tpPriceNum, side)) return null;
		return side === "buy" ? t`TP must be above entry` : t`TP must be below entry`;
	}

	function getSlError(): string | null {
		const slPriceNum = toNumber(slPriceInput);
		if (!isPositive(slPriceNum) || !isPositive(referencePrice)) return null;
		if (validateSlPrice(referencePrice, slPriceNum, side)) return null;
		return side === "buy" ? t`SL must be below entry` : t`SL must be above entry`;
	}

	return (
		<TpSlSection
			framed
			side={side}
			referencePrice={referencePrice}
			size={size}
			szDecimals={szDecimals}
			tpPrice={tpPriceInput}
			slPrice={slPriceInput}
			onTpPriceChange={handleTpPriceChange}
			onSlPriceChange={handleSlPriceChange}
			tpError={getTpError()}
			slError={getSlError()}
			disabled={disabled}
			mobileTouchSafe={mobileTouchSafe}
			linkedReturnInputs={{
				unitLabel: tpUnit,
				onUnitToggle: () => handleUnitToggle("tp"),
				tp: {
					ariaLabel: t`Take profit return`,
					placeholder: t`Profit`,
					value: getReturnValue("tp"),
					unitLabel: tpUnit,
					onUnitToggle: () => handleUnitToggle("tp"),
					disabled: disabled || !canLinkReturn("tp"),
					onBlur: () => handleReturnBlur("tp"),
					onChange: (value) => handleReturnChange("tp", value),
				},
				sl: {
					ariaLabel: t`Stop loss return`,
					placeholder: t`Loss`,
					value: getReturnValue("sl"),
					unitLabel: slUnit,
					onUnitToggle: () => handleUnitToggle("sl"),
					disabled: disabled || !canLinkReturn("sl"),
					onBlur: () => handleReturnBlur("sl"),
					onChange: (value) => handleReturnChange("sl", value),
				},
			}}
		/>
	);
}
