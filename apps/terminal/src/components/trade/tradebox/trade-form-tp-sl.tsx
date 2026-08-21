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
import {
	useOrderEntryActions,
	useOrderSide,
	useSlPrice,
	useSlReturnInvalid,
	useTpPrice,
	useTpReturnInvalid,
} from "@/stores/use-order-entry-store";
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

type ReturnDraftState = "inactive" | "empty" | "intermediate" | "valid" | "unrepresentable";

interface SyncLinkedPriceParams {
	draft: string | null;
	target: string | null | undefined;
	currentPrice: string;
	invalid: boolean;
	setPrice: (price: string) => void;
	setInvalid: (invalid: boolean) => void;
}

function syncLinkedPrice({ draft, target, currentPrice, invalid, setPrice, setInvalid }: SyncLinkedPriceParams) {
	if (draft === null) return;
	if (target === null || target === undefined) {
		if (currentPrice !== "") setPrice("");
		setInvalid(invalid);
		return;
	}
	if (!toBig(currentPrice)?.eq(target)) setPrice(target);
	setInvalid(false);
}

function getReturnDraftState(draft: string | null, target: string | null | undefined): ReturnDraftState {
	if (draft === null) return "inactive";
	if (draft === "") return "empty";
	if (/^\d*\.?\d*$/.test(draft) && !(toBig(draft)?.gt(0) ?? false)) return "intermediate";
	return target === null ? "unrepresentable" : "valid";
}

export function TradeFormTpSl(props: Props) {
	const side = useOrderSide();
	const returnContextKey = [props.marketId ?? "", side, props.quoteSymbol ?? ""].join("|");
	const unitContextKey = [props.marketId ?? "", props.quoteSymbol ?? ""].join("|");
	return <TradeFormTpSlFields key={unitContextKey} {...props} side={side} returnContextKey={returnContextKey} />;
}

function TradeFormTpSlFields({
	assetId,
	referencePrice,
	size,
	szDecimals,
	disabled,
	quoteSymbol,
	leverage,
	mobileTouchSafe,
	side,
	returnContextKey,
}: Props & { side: "buy" | "sell"; returnContextKey: string }) {
	const { t } = useLingui();
	const tpPriceInput = useTpPrice();
	const slPriceInput = useSlPrice();
	const tpReturnInvalid = useTpReturnInvalid();
	const slReturnInvalid = useSlReturnInvalid();
	const { setTpPrice, setSlPrice, setTpReturnInvalid, setSlReturnInvalid } = useOrderEntryActions();

	const [tpUnit, setTpUnit] = useState<ReturnUnit>("roe");
	const [slUnit, setSlUnit] = useState<ReturnUnit>("roe");
	const [tpReturnDraft, setTpReturnDraft] = useState<ReturnDraft | null>(null);
	const [slReturnDraft, setSlReturnDraft] = useState<ReturnDraft | null>(null);
	const [tpIntermediateErrorRevealed, setTpIntermediateErrorRevealed] = useState(false);
	const [slIntermediateErrorRevealed, setSlIntermediateErrorRevealed] = useState(false);

	const priceDecimals = szDecimalsToPriceDecimals(szDecimals);
	const normalizedReferencePrice = normalizePrice(referencePrice);

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
		if (!parsed?.gt(0)) return "";
		const rounded = parsed.round(fractionDigits);
		return rounded.gt(0) ? rounded.toString() : parsed.toFixed();
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

	function getDraftTarget(kind: TpSlKind, draft: string | null): string | null | undefined {
		if (draft === null) return undefined;
		if (!/^\d*\.?\d*$/.test(draft)) return null;
		const magnitude = toBig(draft);
		if (!magnitude?.gt(0)) return null;
		return priceFromReturn(kind, magnitude.toString());
	}

	const tpDraftValue = getCurrentDraft("tp");
	const slDraftValue = getCurrentDraft("sl");
	const tpDraftTarget = getDraftTarget("tp", tpDraftValue);
	const slDraftTarget = getDraftTarget("sl", slDraftValue);
	const tpDraftState = getReturnDraftState(tpDraftValue, tpDraftTarget);
	const slDraftState = getReturnDraftState(slDraftValue, slDraftTarget);
	const tpReturnErrorVisible =
		tpDraftState === "unrepresentable" || (tpDraftState === "intermediate" && tpIntermediateErrorRevealed);
	const slReturnErrorVisible =
		slDraftState === "unrepresentable" || (slDraftState === "intermediate" && slIntermediateErrorRevealed);

	useEffect(() => {
		syncLinkedPrice({
			draft: tpDraftValue,
			target: tpDraftTarget,
			currentPrice: tpPriceInput,
			invalid: tpDraftState === "unrepresentable" || (tpDraftState === "intermediate" && tpIntermediateErrorRevealed),
			setPrice: setTpPrice,
			setInvalid: setTpReturnInvalid,
		});
		syncLinkedPrice({
			draft: slDraftValue,
			target: slDraftTarget,
			currentPrice: slPriceInput,
			invalid: slDraftState === "unrepresentable" || (slDraftState === "intermediate" && slIntermediateErrorRevealed),
			setPrice: setSlPrice,
			setInvalid: setSlReturnInvalid,
		});
	}, [
		tpDraftValue,
		tpDraftTarget,
		tpDraftState,
		tpPriceInput,
		tpIntermediateErrorRevealed,
		setTpPrice,
		setTpReturnInvalid,
		slDraftValue,
		slDraftTarget,
		slDraftState,
		slPriceInput,
		slIntermediateErrorRevealed,
		setSlPrice,
		setSlReturnInvalid,
	]);

	useEffect(
		() => () => {
			setTpReturnInvalid(false);
			setSlReturnInvalid(false);
		},
		[setTpReturnInvalid, setSlReturnInvalid],
	);

	function handleReturnChange(kind: TpSlKind, value: string) {
		const setDraft = kind === "tp" ? setTpReturnDraft : setSlReturnDraft;
		const setPrice = kind === "tp" ? setTpPrice : setSlPrice;
		const setInvalid = kind === "tp" ? setTpReturnInvalid : setSlReturnInvalid;
		const setIntermediateErrorRevealed =
			kind === "tp" ? setTpIntermediateErrorRevealed : setSlIntermediateErrorRevealed;
		const currentPrice = kind === "tp" ? tpPriceInput : slPriceInput;
		const target = getDraftTarget(kind, value);
		const draftState = getReturnDraftState(value, target);
		setDraft({ contextKey: returnContextKey, value });
		setIntermediateErrorRevealed(false);
		syncLinkedPrice({
			draft: value,
			target,
			currentPrice,
			invalid: draftState === "unrepresentable",
			setPrice,
			setInvalid,
		});
	}

	function handleReturnBlur(kind: TpSlKind) {
		if (kind === "tp") {
			if (tpDraftState === "intermediate") {
				setTpReturnInvalid(true);
				setTpIntermediateErrorRevealed(true);
				return;
			}
			if (tpReturnInvalid) {
				setTpIntermediateErrorRevealed(true);
				return;
			}
			setTpIntermediateErrorRevealed(false);
			setTpReturnDraft(null);
			return;
		}
		if (slDraftState === "intermediate") {
			setSlReturnInvalid(true);
			setSlIntermediateErrorRevealed(true);
			return;
		}
		if (slReturnInvalid) {
			setSlIntermediateErrorRevealed(true);
			return;
		}
		setSlIntermediateErrorRevealed(false);
		setSlReturnDraft(null);
	}

	function handleUnitToggle(kind: TpSlKind) {
		if (getUnit(kind) === "roe" && quoteSymbol === null) return;
		if (kind === "tp") {
			setTpUnit((current) => (current === "roe" ? "collateral" : "roe"));
			setTpReturnDraft(null);
			setTpReturnInvalid(false);
			setTpIntermediateErrorRevealed(false);
		} else {
			setSlUnit((current) => (current === "roe" ? "collateral" : "roe"));
			setSlReturnDraft(null);
			setSlReturnInvalid(false);
			setSlIntermediateErrorRevealed(false);
		}
	}

	function handleTpPriceChange(value: string) {
		setTpReturnDraft(null);
		setTpIntermediateErrorRevealed(false);
		setTpPrice(value);
	}

	function handleSlPriceChange(value: string) {
		setSlReturnDraft(null);
		setSlIntermediateErrorRevealed(false);
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
					error: tpReturnInvalid && tpReturnErrorVisible && tpDraftValue !== null ? t`Invalid amount` : null,
					unitLabel: getUnitLabel("tp"),
					onUnitToggle: () => handleUnitToggle("tp"),
					unitToggleDisabled: quoteSymbol === null && getUnit("tp") === "roe",
					disabled: disabled || !canLinkReturn("tp"),
					onBlur: () => handleReturnBlur("tp"),
					onChange: (value) => handleReturnChange("tp", value),
				},
				sl: {
					ariaLabel: t`Stop loss return`,
					placeholder: t`Loss`,
					value: getReturnValue("sl"),
					error: slReturnInvalid && slReturnErrorVisible && slDraftValue !== null ? t`Invalid amount` : null,
					unitLabel: getUnitLabel("sl"),
					onUnitToggle: () => handleUnitToggle("sl"),
					unitToggleDisabled: quoteSymbol === null && getUnit("sl") === "roe",
					disabled: disabled || !canLinkReturn("sl"),
					onBlur: () => handleReturnBlur("sl"),
					onChange: (value) => handleReturnChange("sl", value),
				},
			}}
		/>
	);
}
