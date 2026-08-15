import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { formatPriceForOrder } from "@/domain/trade/orders";
import { szDecimalsToPriceDecimals } from "@/lib/format";
import { isPositive, toBig } from "@/lib/trade/numbers";
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
	assetId: number | null;
	marketId: string | null;
	referencePrice: number;
	size: number;
	szDecimals: number;
	disabled: boolean;
	quoteSymbol: string | null;
	leverage?: number;
	mobileTouchSafe?: boolean;
}

type ReturnUnit = "roe" | "collateral";
type TpSlKind = "tp" | "sl";
interface ReturnDraft {
	contextKey: string;
	value: string;
}

export function TradeFormTpSl({
	assetId,
	marketId,
	referencePrice,
	size,
	szDecimals,
	disabled,
	quoteSymbol,
	leverage,
	mobileTouchSafe,
}: Props) {
	const { t } = useLingui();
	const side = useOrderSide();
	const tpPriceInput = useTpPrice();
	const slPriceInput = useSlPrice();
	const { setTpPrice, setSlPrice } = useOrderEntryActions();

	const [tpUnit, setTpUnit] = useState<ReturnUnit>("roe");
	const [slUnit, setSlUnit] = useState<ReturnUnit>("roe");
	const [tpReturnDraft, setTpReturnDraft] = useState<ReturnDraft | null>(null);
	const [slReturnDraft, setSlReturnDraft] = useState<ReturnDraft | null>(null);

	const priceDecimals = szDecimalsToPriceDecimals(szDecimals);
	const normalizedReferencePrice = normalizePrice(referencePrice);
	const returnContextKey = [marketId ?? "", side, quoteSymbol ?? ""].join("|");

	function normalizePrice(value: string | number | null): string | null {
		if (assetId === null) return null;
		const parsed = toBig(value);
		if (!parsed?.gt(0)) return null;
		const normalized = formatPriceForOrder(parsed, { assetId, szDecimals });
		return toBig(normalized)?.gt(0) ? normalized : null;
	}

	function getUnit(kind: TpSlKind): ReturnUnit {
		return kind === "tp" ? tpUnit : slUnit;
	}

	function getUnitLabel(kind: TpSlKind): string {
		if (getUnit(kind) === "roe") return "%";
		return quoteSymbol === DEFAULT_QUOTE_TOKEN ? "$" : (quoteSymbol ?? "");
	}

	function getCurrentDraft(kind: TpSlKind): string | null {
		const draft = kind === "tp" ? tpReturnDraft : slReturnDraft;
		return draft?.contextKey === returnContextKey ? draft.value : null;
	}

	function canLinkReturn(kind: TpSlKind): boolean {
		if (normalizedReferencePrice === null) return false;
		if (getUnit(kind) === "roe") return isPositive(leverage);
		return quoteSymbol !== null && isPositive(size);
	}

	function isDirectionValid(kind: TpSlKind, price: string): boolean {
		const normalizedPrice = normalizePrice(price);
		if (normalizedReferencePrice === null || normalizedPrice === null) return false;
		if (kind === "tp") return validateTpPrice(normalizedReferencePrice, normalizedPrice, side);
		return validateSlPrice(normalizedReferencePrice, normalizedPrice, side);
	}

	function formatReturnMagnitude(value: string | number | null, fractionDigits: number): string {
		const parsed = toBig(value)?.abs();
		return parsed?.gt(0) ? parsed.round(fractionDigits).toString() : "";
	}

	function getReturnValue(kind: TpSlKind): string {
		const draft = getCurrentDraft(kind);
		if (draft !== null) return draft;
		const price = kind === "tp" ? tpPriceInput : slPriceInput;
		const normalizedPrice = normalizePrice(price);
		if (normalizedReferencePrice === null || normalizedPrice === null || !isDirectionValid(kind, price)) return "";
		if (getUnit(kind) === "roe") {
			return formatReturnMagnitude(
				calculateRoeMagnitudeFromPriceExact(normalizedReferencePrice, normalizedPrice, side, kind, leverage),
				2,
			);
		}
		return formatReturnMagnitude(
			calculateEstimatedPnlExact({ referencePrice: normalizedReferencePrice, side, size }, normalizedPrice),
			2,
		);
	}

	function priceFromReturn(kind: TpSlKind, magnitude: string): string | null {
		if (normalizedReferencePrice === null) return null;
		let target: string | null;
		if (getUnit(kind) === "roe") {
			const fromRoe = kind === "tp" ? calculateTpPriceFromRoe : calculateSlPriceFromRoe;
			target = fromRoe(normalizedReferencePrice, side, magnitude, leverage, priceDecimals);
		} else {
			target = calculateTargetPriceFromPnl(normalizedReferencePrice, side, size, magnitude, kind, priceDecimals);
		}
		const normalizedTarget = normalizePrice(target);
		if (normalizedTarget === null || toBig(normalizedTarget)?.eq(normalizedReferencePrice)) return null;
		if (kind === "tp" && !validateTpPrice(normalizedReferencePrice, normalizedTarget, side)) return null;
		if (kind === "sl" && !validateSlPrice(normalizedReferencePrice, normalizedTarget, side)) return null;
		return toBig(target)?.eq(normalizedTarget) ? target : normalizedTarget;
	}

	const tpDraftValue = getCurrentDraft("tp");
	const slDraftValue = getCurrentDraft("sl");
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-derive linked prices only when the market inputs the drafts depend on move
	useEffect(() => {
		syncPriceFromDraft("tp", tpDraftValue);
		syncPriceFromDraft("sl", slDraftValue);
	}, [normalizedReferencePrice, size, leverage, tpUnit, slUnit]);

	function syncPriceFromDraft(kind: TpSlKind, draft: string | null) {
		if (draft === null) return;
		const magnitude = toBig(draft);
		if (!magnitude || magnitude.lte(0)) return;
		const target = priceFromReturn(kind, magnitude.toString());
		if (target === null) return;
		const current = kind === "tp" ? tpPriceInput : slPriceInput;
		if (toBig(current)?.eq(target)) return;
		if (kind === "tp") setTpPrice(target);
		else setSlPrice(target);
	}

	function handleReturnChange(kind: TpSlKind, value: string) {
		const setDraft = kind === "tp" ? setTpReturnDraft : setSlReturnDraft;
		const setPrice = kind === "tp" ? setTpPrice : setSlPrice;
		setDraft({ contextKey: returnContextKey, value });
		if (!/^\d*\.?\d*$/.test(value)) {
			setPrice("");
			return;
		}
		const magnitude = toBig(value);
		if (!magnitude || magnitude.lte(0)) {
			setPrice("");
			return;
		}
		const target = priceFromReturn(kind, magnitude.toString());
		setPrice(target ?? "");
	}

	function handleReturnBlur(kind: TpSlKind) {
		if (kind === "tp") setTpReturnDraft(null);
		else setSlReturnDraft(null);
	}

	function handleUnitToggle(kind: TpSlKind) {
		if (getUnit(kind) === "roe" && quoteSymbol === null) return;
		if (kind === "tp") {
			setTpUnit((current) => (current === "roe" ? "collateral" : "roe"));
			setTpReturnDraft(null);
		} else {
			setSlUnit((current) => (current === "roe" ? "collateral" : "roe"));
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

	function normalizeStoredPrice(kind: TpSlKind) {
		const value = kind === "tp" ? tpPriceInput : slPriceInput;
		const normalized = normalizePrice(value);
		if (normalized === null || toBig(normalized)?.eq(value)) return;
		if (kind === "tp") setTpPrice(normalized);
		else setSlPrice(normalized);
	}

	function getTpError(): string | null {
		const normalizedTpPrice = normalizePrice(tpPriceInput);
		if (normalizedTpPrice === null || normalizedReferencePrice === null) return null;
		if (validateTpPrice(normalizedReferencePrice, normalizedTpPrice, side)) return null;
		return side === "buy" ? t`TP must be above entry` : t`TP must be below entry`;
	}

	function getSlError(): string | null {
		const normalizedSlPrice = normalizePrice(slPriceInput);
		if (normalizedSlPrice === null || normalizedReferencePrice === null) return null;
		if (validateSlPrice(normalizedReferencePrice, normalizedSlPrice, side)) return null;
		return side === "buy" ? t`SL must be below entry` : t`SL must be above entry`;
	}

	return (
		<TpSlSection
			framed
			side={side}
			referencePrice={normalizedReferencePrice ?? 0}
			size={size}
			szDecimals={szDecimals}
			tpPrice={tpPriceInput}
			slPrice={slPriceInput}
			onTpPriceChange={handleTpPriceChange}
			onSlPriceChange={handleSlPriceChange}
			onTpPriceBlur={() => normalizeStoredPrice("tp")}
			onSlPriceBlur={() => normalizeStoredPrice("sl")}
			tpError={getTpError()}
			slError={getSlError()}
			disabled={disabled}
			mobileTouchSafe={mobileTouchSafe}
			quoteSymbol={quoteSymbol}
			linkedReturnInputs={{
				unitLabel: getUnitLabel("tp"),
				onUnitToggle: () => handleUnitToggle("tp"),
				tp: {
					ariaLabel: t`Take profit return`,
					placeholder: t`Profit`,
					value: getReturnValue("tp"),
					unitLabel: getUnitLabel("tp"),
					onUnitToggle: () => handleUnitToggle("tp"),
					unitToggleDisabled: quoteSymbol === null,
					disabled: disabled || !canLinkReturn("tp"),
					onBlur: () => handleReturnBlur("tp"),
					onChange: (value) => handleReturnChange("tp", value),
				},
				sl: {
					ariaLabel: t`Stop loss return`,
					placeholder: t`Loss`,
					value: getReturnValue("sl"),
					unitLabel: getUnitLabel("sl"),
					onUnitToggle: () => handleUnitToggle("sl"),
					unitToggleDisabled: quoteSymbol === null,
					disabled: disabled || !canLinkReturn("sl"),
					onBlur: () => handleReturnBlur("sl"),
					onChange: (value) => handleReturnChange("sl", value),
				},
			}}
		/>
	);
}
