import { i18n } from "@lingui/core";
import { useSyncExternalStore } from "react";
import { FALLBACK_VALUE_PLACEHOLDER, FORMAT_COMPACT_DEFAULT, FORMAT_COMPACT_THRESHOLD } from "@/config/app";
import {
	defaultLocale,
	defaultNumberFormatLocale,
	isRtlLocale,
	isValidLocale,
	type LocaleCode,
	languageToIntlLocale,
	type NumberFormatLocale,
	numberSeparatorsByFormatLocale,
} from "@/config/i18n";
import { HL_PERP_PRICE_MAX_DECIMALS, HL_PRICE_MAX_DECIMALS } from "@/config/trade";
import { getNumberFormatRevision, subscribeNumberFormatChange } from "@/lib/number-format-reactivity";
import { getPriceDisplayDecimals, toNumber } from "@/lib/trade/numbers";
import { getResolvedFormatLocale } from "@/stores/use-global-settings-store";

type Formatter = Intl.NumberFormat | Intl.DateTimeFormat;
type DateInput = Date | number | string | null | undefined;

const formatterCache = new Map<string, Formatter>();
const BASE_NUMBER_FORMAT_LOCALE = "en-US";
const DATE_NUMBERING_SYSTEM = "latn";

export interface FormatOptions extends Intl.NumberFormatOptions {
	decimals?: number;
	compact?: boolean;
}

export interface FormatTokenOptions extends FormatOptions {
	symbol?: string;
}

function isValidNumber(value: number | null | undefined): value is number {
	return typeof value === "number" && !Number.isNaN(value) && Number.isFinite(value);
}

function isValidDate(value: DateInput): value is Date | number | string {
	if (value === null || value === undefined) return false;
	if (value instanceof Date) return !Number.isNaN(value.getTime());
	if (typeof value === "number") return Number.isFinite(value);
	if (typeof value === "string") return !Number.isNaN(Date.parse(value));
	return false;
}

function toDate(value: Date | number | string): Date {
	if (value instanceof Date) return value;
	return new Date(value);
}

function getFormatter(type: "number", locale: string | undefined, opts: Intl.NumberFormatOptions): Intl.NumberFormat;
function getFormatter(type: "date", locale: string | undefined, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat;
function getFormatter(
	type: "number" | "date",
	locale: string | undefined,
	opts: Intl.NumberFormatOptions | Intl.DateTimeFormatOptions,
): Formatter {
	const key = `${type}-${locale || "default"}-${JSON.stringify(opts)}`;
	const resolvedLocale = locale || "en-US";

	if (!formatterCache.has(key)) {
		if (type === "number") {
			formatterCache.set(key, new Intl.NumberFormat(resolvedLocale, opts as Intl.NumberFormatOptions));
		} else {
			formatterCache.set(
				key,
				new Intl.DateTimeFormat(resolvedLocale, {
					numberingSystem: DATE_NUMBERING_SYSTEM,
					...(opts as Intl.DateTimeFormatOptions),
				}),
			);
		}
	}

	const formatter = formatterCache.get(key);
	if (!formatter) {
		throw new Error("Formatter not found in cache");
	}
	return formatter;
}

function formatNumberParts(value: number, opts: Intl.NumberFormatOptions): string {
	const formatter = getFormatter("number", BASE_NUMBER_FORMAT_LOCALE, opts);
	const separators = getActiveNumberSeparators();

	return formatter
		.formatToParts(value)
		.map((part) => {
			if (part.type === "group") return separators.group;
			if (part.type === "decimal") return separators.decimal;
			return part.value;
		})
		.join("");
}

function getActiveNumberSeparators(): { group: string; decimal: string } {
	return (
		numberSeparatorsByFormatLocale[getResolvedFormatLocale() as NumberFormatLocale] ??
		numberSeparatorsByFormatLocale[defaultNumberFormatLocale]
	);
}

/**
 * Typed decimal input stays a protocol string with `.` as the decimal point. When the active
 * number format displays `,` as the decimal sign, a typed `,` is accepted as that decimal
 * point; under the default format a `,` is left in place so the input validators reject it
 * instead of silently reading `1,000` as one.
 */
export function normalizeDecimalInput(value: string): string {
	if (getActiveNumberSeparators().decimal !== ",") return value;
	return value.replaceAll(",", ".");
}

function getActiveLanguageIntlLocale(): string {
	return languageToIntlLocale[i18n.locale as LocaleCode] ?? languageToIntlLocale[defaultLocale];
}

function resolveLanguageIntlLocale(locale: string | undefined): string {
	if (!locale) return getActiveLanguageIntlLocale();
	return isValidLocale(locale) ? languageToIntlLocale[locale] : locale;
}

export interface FormatListOptions extends Intl.ListFormatOptions {
	locale?: string;
}

/**
 * Join items the way the interface language does ("A, B and C").
 * @example formatList(["Deposit", "Withdraw"]) -> "Deposit and Withdraw"
 */
export function formatList(items: readonly string[], opts?: FormatListOptions): string {
	const { locale, ...rest } = opts ?? {};
	return new Intl.ListFormat(resolveLanguageIntlLocale(locale), {
		style: "short",
		type: "conjunction",
		...rest,
	}).format(items);
}

// Helper to normalize options
function resolveOptions(opts?: number | FormatOptions): FormatOptions {
	if (typeof opts === "number") return { decimals: opts };
	return opts || {};
}

// Helper to merge options and prevent RangeError
function mergeOptions(defaults: Intl.NumberFormatOptions, opts: FormatOptions): Intl.NumberFormatOptions {
	const merged = { ...defaults, ...opts };

	// Ensure max >= min to prevent RangeError
	if (
		typeof merged.minimumFractionDigits === "number" &&
		typeof merged.maximumFractionDigits === "number" &&
		merged.minimumFractionDigits > merged.maximumFractionDigits
	) {
		merged.maximumFractionDigits = merged.minimumFractionDigits;
	}

	return merged;
}

function parseNumberInput(value: string | number | null | undefined): {
	value: number | null | undefined;
	stringDecimals?: number;
} {
	if (typeof value === "string") {
		const trimmed = value.trim();
		const num = toNumber(trimmed);
		if (num === null) return { value: null };
		const decimalIndex = trimmed.indexOf(".");
		const decimals = decimalIndex === -1 ? 0 : trimmed.length - decimalIndex - 1;
		return { value: num, stringDecimals: decimals };
	}
	return { value };
}

function buildNumberFormatOptions(
	value: number,
	opts: FormatOptions,
	defaults: Intl.NumberFormatOptions,
	compactDefault: boolean,
): Intl.NumberFormatOptions {
	const { compact, ...rest } = opts;
	const shouldCompact = (compact ?? compactDefault) && Math.abs(value) >= FORMAT_COMPACT_THRESHOLD;
	const compactOptions = shouldCompact ? { notation: "compact", compactDisplay: "short" } : {};

	return mergeOptions({ ...defaults, ...compactOptions } as Intl.NumberFormatOptions, rest);
}

/**
 * Format as USD currency
 * @example formatUSD(1234.56) -> "$1,234.56"
 * @example formatUSD("1234.56") -> "$1,234.56"
 * @example formatUSD(1234.56, 0) -> "$1,235"
 * @example formatUSD(150000) -> "$150K"
 * @example formatUSD(150000, { compact: false }) -> "$150,000.00"
 */
export function formatUSD(value: string | number | null | undefined, opts?: number | FormatOptions) {
	const parsed = parseNumberInput(value);
	if (!isValidNumber(parsed.value)) return FALLBACK_VALUE_PLACEHOLDER;

	const { decimals, compact, ...rest } = resolveOptions(opts);
	const usesCompactNotation = (compact ?? FORMAT_COMPACT_DEFAULT) && Math.abs(parsed.value) >= FORMAT_COMPACT_THRESHOLD;

	const defaults: Intl.NumberFormatOptions = {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: decimals ?? (usesCompactNotation ? 0 : 2),
		maximumFractionDigits: decimals ?? 2,
	};
	const formatOptions = buildNumberFormatOptions(parsed.value, { compact, ...rest }, defaults, FORMAT_COMPACT_DEFAULT);
	return formatNumberParts(parsed.value, formatOptions);
}

/**
 * Calculate price decimals from szDecimals using Hyperliquid's market-specific rule.
 * Perp prices use max(0, 6 - szDecimals); spot prices use max(0, 8 - szDecimals).
 *
 * @example szDecimalsToPriceDecimals(4) -> 2 (BTC: szDecimals=4, at most 2 price decimals)
 * @example szDecimalsToPriceDecimals(3) -> 3 (ETH: szDecimals=3, at most 3 price decimals)
 * @example szDecimalsToPriceDecimals(0) -> 6 (low-priced perpetual)
 * @example szDecimalsToPriceDecimals(0, "spot") -> 8 (low-priced spot asset)
 */
export function szDecimalsToPriceDecimals(szDecimals: number, marketType: "perp" | "spot" = "perp"): number {
	const maxDecimals = marketType === "spot" ? HL_PRICE_MAX_DECIMALS : HL_PERP_PRICE_MAX_DECIMALS;
	return Math.max(0, maxDecimals - szDecimals);
}

export interface FormatPriceOptions extends FormatOptions {
	/** Size decimals from market metadata - used to derive price decimals */
	szDecimals?: number;
	/** Hyperliquid market type used to select the protocol decimal cap. Defaults to perpetuals. */
	marketType?: "perp" | "spot";
	/**
	 * Remove trailing zeros (e.g., 12.00 -> 12, 12.50 -> 12.5). A market price (`szDecimals` without `decimals`)
	 * keeps them unless this is true; an explicit `decimals` removes them unless this is false.
	 */
	trimZeros?: boolean;
}

/**
 * Format a price. With `szDecimals` it is a market price shown as the official terminal shows it (`R3`): five
 * significant figures, capped at the market's protocol decimals (`MAX_DECIMALS - szDecimals`), and every one of
 * those decimals kept, so a live price keeps its width as it moves. An explicit `decimals` and compact notation
 * keep the trimmed form.
 *
 * @example formatPrice(88140.123, { szDecimals: 4 }) -> "$88,140" (BTC)
 * @example formatPrice("3456.789", { szDecimals: 3 }) -> "$3,456.8" (ETH)
 * @example formatPrice(85.81, { szDecimals: 2 }) -> "$85.810" (HYPE)
 * @example formatPrice(0.00001234, { szDecimals: 0 }) -> "$0.000012" (low-priced)
 */
export function formatPrice(value: string | number | null | undefined, opts?: FormatPriceOptions): string {
	const parsed = parseNumberInput(value);
	if (!isValidNumber(parsed.value)) return FALLBACK_VALUE_PLACEHOLDER;

	const { decimals: decOpt, compact, szDecimals, marketType, trimZeros, ...rest } = opts ?? {};
	const protocolDecimals = szDecimals !== undefined ? szDecimalsToPriceDecimals(szDecimals, marketType) : undefined;
	const usesCompactNotation = compact === true && Math.abs(parsed.value) >= FORMAT_COMPACT_THRESHOLD;
	const isMarketPrice = decOpt === undefined && protocolDecimals !== undefined && !usesCompactNotation;
	const resolvedDecimals = resolvePriceDecimals(parsed.value, decOpt, protocolDecimals, isMarketPrice);
	const keepsTrailingZeros = trimZeros === undefined ? isMarketPrice : !trimZeros;

	const defaults: Intl.NumberFormatOptions = {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: keepsTrailingZeros ? resolvedDecimals : 0,
		maximumFractionDigits: resolvedDecimals,
	};

	const formatOptions = buildNumberFormatOptions(parsed.value, { compact, ...rest }, defaults, false);
	return formatNumberParts(parsed.value, formatOptions);
}

function resolvePriceDecimals(
	value: number,
	decimals: number | undefined,
	protocolDecimals: number | undefined,
	isMarketPrice: boolean,
): number {
	if (decimals !== undefined) return decimals;
	if (protocolDecimals === undefined) return 2;
	return isMarketPrice ? getPriceDisplayDecimals(value, protocolDecimals) : protocolDecimals;
}

export function formatLiquidationPrice(
	value: string | number | null | undefined,
	szDecimals: number,
	opts?: Omit<FormatPriceOptions, "decimals" | "szDecimals">,
): string {
	const parsed = parseNumberInput(value);
	if (!isValidNumber(parsed.value)) return FALLBACK_VALUE_PLACEHOLDER;
	if (Math.abs(parsed.value) >= 1_000_000) return formatPrice(value, { ...opts, szDecimals, compact: true });
	return formatPrice(value, { ...opts, szDecimals });
}

/**
 * Format token amount
 * @example formatToken(1.234567) -> "1.23457"
 * @example formatToken("1.234567", 2) -> "1.23"
 * @example formatToken(1.234567, "ETH") -> "1.23457 ETH"
 * @example formatToken(1.234567, { decimals: 2, symbol: "ETH" }) -> "1.23 ETH"
 */
export function formatToken(value: string | number | null | undefined, opts?: number | string | FormatTokenOptions) {
	const parsed = parseNumberInput(value);
	if (!isValidNumber(parsed.value)) return FALLBACK_VALUE_PLACEHOLDER;

	let options: FormatTokenOptions = {};

	if (typeof opts === "number") {
		options = { decimals: opts };
	} else if (typeof opts === "string") {
		options = { symbol: opts };
	} else {
		options = opts || {};
	}

	const { decimals, symbol, compact, ...rest } = options;

	const defaults: Intl.NumberFormatOptions = {
		style: "decimal",
		minimumFractionDigits: decimals ?? 5,
		maximumFractionDigits: decimals ?? 5,
	};

	const formatOptions = buildNumberFormatOptions(parsed.value, { compact, ...rest }, defaults, false);
	const number = formatNumberParts(parsed.value, formatOptions);
	return symbol ? `${number} ${symbol}` : number;
}

export function formatQuoteAmount(
	value: string | number | null | undefined,
	quoteSymbol: string,
	opts?: number | FormatOptions,
): string {
	const options = typeof opts === "number" ? { decimals: opts } : opts;
	return formatToken(value, { ...options, symbol: quoteSymbol });
}

/**
 * Format percentage
 * Expects decimal input (0.15 = 15%)
 * @example formatPercent(0.153) -> "15.30%"
 * @example formatPercent("0.153", 1) -> "15.3%"
 */
export function formatPercent(value: string | number | null | undefined, opts?: number | FormatOptions) {
	const parsed = parseNumberInput(value);
	if (!isValidNumber(parsed.value)) return FALLBACK_VALUE_PLACEHOLDER;

	const { decimals, compact, ...rest } = resolveOptions(opts);
	const defaults: Intl.NumberFormatOptions = {
		style: "percent",
		minimumFractionDigits: decimals ?? 2,
		maximumFractionDigits: decimals ?? 2,
		signDisplay: "exceptZero",
	};
	const formatOptions = buildNumberFormatOptions(parsed.value, { compact, ...rest }, defaults, false);
	return formatNumberParts(parsed.value, formatOptions);
}

/**
 * Format a number with commas and decimal precision.
 *
 * - If value is a string and decimals are not provided, preserves its original decimal precision (for API values)
 * - If value is a number with decimals specified, uses those
 * - If value is a number without decimals, uses 0-3 decimals
 *
 * @example formatNumber("95001.5") -> "95,001.5" (string: preserves precision)
 * @example formatNumber("2.0001") -> "2.0001" (string: preserves precision)
 * @example formatNumber(1234.5678, 2) -> "1,234.57" (number with digits)
 * @example formatNumber(1234.5) -> "1,234.5" (number, default 0-3 decimals)
 */
export function formatNumber(value: string | number | null | undefined, opts?: number | FormatOptions): string {
	const parsed = parseNumberInput(value);
	if (!isValidNumber(parsed.value)) return FALLBACK_VALUE_PLACEHOLDER;

	const { decimals, compact, ...rest } = resolveOptions(opts);
	const stringDecimals = parsed.stringDecimals;
	const resolvedDecimals = decimals ?? (typeof stringDecimals === "number" ? stringDecimals : undefined);
	const defaults: Intl.NumberFormatOptions = {
		style: "decimal",
		minimumFractionDigits: resolvedDecimals ?? 0,
		maximumFractionDigits: resolvedDecimals ?? 3,
	};
	const formatOptions = buildNumberFormatOptions(parsed.value, { compact, ...rest }, defaults, false);
	return formatNumberParts(parsed.value, formatOptions);
}

/**
 * Shorten an Ethereum address for display
 * @example shortenAddress("0x1234567890123456789012345678901234567890") -> "0x1234...7890"
 * @example shortenAddress("0x1234567890123456789012345678901234567890", 4, 4) -> "0x12...7890"
 * @example shortenAddress("0x1234567890123456789012345678901234567890", 6, 4) -> "0x1234...7890"
 */
export function shortenAddress(address: string, startLength = 4, endLength = 4): string {
	if (!address || address.length < startLength + endLength) {
		return address;
	}
	if (address.startsWith("0x")) {
		return `${address.slice(0, startLength + 2)}...${address.slice(-endLength)}`;
	}
	return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
}

export interface FormatDateOptions extends Intl.DateTimeFormatOptions {
	locale?: string;
}

const DATE_COMPONENT_KEYS = [
	"weekday",
	"era",
	"year",
	"month",
	"day",
	"dayPeriod",
	"hour",
	"minute",
	"second",
	"fractionalSecondDigits",
	"timeZoneName",
] as const;

function hasDateComponentOptions(opts: Intl.DateTimeFormatOptions): boolean {
	return DATE_COMPONENT_KEYS.some((key) => key in opts);
}

function hasStyleOptions(opts: Intl.DateTimeFormatOptions): boolean {
	return "dateStyle" in opts || "timeStyle" in opts;
}

/**
 * Format time only
 * @example formatTime(new Date()) -> "2:30 PM"
 * @example formatTime(new Date(), { timeStyle: "medium" }) -> "2:30:45 PM"
 * @example formatTime(new Date(), { hour12: false }) -> "14:30"
 */
export function formatTime(value: DateInput, opts?: FormatDateOptions): string {
	if (!isValidDate(value)) return FALLBACK_VALUE_PLACEHOLDER;

	const { locale, ...rest } = opts ?? {};
	const formatOpts: Intl.DateTimeFormatOptions = hasDateComponentOptions(rest) ? rest : { timeStyle: "short", ...rest };

	return getFormatter("date", resolveLanguageIntlLocale(locale), formatOpts).format(toDate(value));
}

/**
 * Format date and time together
 * @example formatDateTime(new Date()) -> "Jan 5, 2026, 2:30 PM"
 * @example formatDateTime(new Date(), { dateStyle: "short", timeStyle: "short" }) -> "1/5/26, 2:30 PM"
 */
export function formatDateTime(value: DateInput, opts?: FormatDateOptions): string {
	if (!isValidDate(value)) return FALLBACK_VALUE_PLACEHOLDER;

	const { locale, ...rest } = opts ?? {};
	const formatOpts: Intl.DateTimeFormatOptions =
		hasDateComponentOptions(rest) || hasStyleOptions(rest)
			? rest
			: { dateStyle: "medium", timeStyle: "short", ...rest };

	return getFormatter("date", resolveLanguageIntlLocale(locale), formatOpts).format(toDate(value));
}

export function formatDateTimeShort(value: DateInput, opts?: FormatDateOptions): string {
	if (!isValidDate(value)) return FALLBACK_VALUE_PLACEHOLDER;

	const { locale, ...rest } = opts ?? {};

	// MM/DD HH:mm │ 01/29 14:35
	const defaults: Intl.DateTimeFormatOptions = {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		...rest,
	};

	return getFormatter("date", resolveLanguageIntlLocale(locale), defaults).format(toDate(value));
}

/**
 * Convert basis points to percentage string
 * 100000 bps = 100%, so divide by 1000 to get percentage
 * @example bpsToPercentage(10) -> "0.01"
 * @example bpsToPercentage(100) -> "0.10"
 * @example bpsToPercentage(1000) -> "1.00"
 */
export function bpsToPercentage(bps: string | number | null | undefined, decimals = 2): string {
	const parsed = parseNumberInput(bps);
	if (!isValidNumber(parsed.value)) return "0";
	return (parsed.value / 1000).toFixed(decimals);
}

const SLIPPAGE_MIN_DISPLAY_PERCENT = 0.0001;

export interface FormatSlippageOptions {
	/** The order consumed all visible depth, so the real cost is worse than the returned figure. */
	lowerBound?: boolean;
}

/**
 * Format real basis points of order-book slippage as a percentage string.
 * Divides by 100 (1 bp = 0.01%), unlike bpsToPercentage which divides by 1000
 * for the tenth-of-a-bp builder fee convention. Taker slippage on liquid markets
 * is sub-bp, so the decimals scale down instead of rounding to "0.00%".
 * @example formatSlippageBps(37) -> "0.37%"
 * @example formatSlippageBps(0.0793) -> "0.0008%"
 * @example formatSlippageBps(120, { lowerBound: true }) -> ">1.20%"
 */
export function formatSlippageBps(bps: number | null | undefined, options: FormatSlippageOptions = {}): string | null {
	if (typeof bps !== "number" || !Number.isFinite(bps) || bps < 0) return null;
	const percent = bps / 100;
	if (options.lowerBound) return `>${formatNumber(percent, getSlippagePercentDecimals(percent))}%`;
	if (percent > 0 && percent < SLIPPAGE_MIN_DISPLAY_PERCENT) {
		return `<${formatNumber(SLIPPAGE_MIN_DISPLAY_PERCENT, 4)}%`;
	}
	return `${formatNumber(percent, getSlippagePercentDecimals(percent))}%`;
}

function getSlippagePercentDecimals(percent: number): number {
	if (percent >= 0.1) return 2;
	if (percent >= 0.01) return 3;
	return 4;
}

const PLAIN_DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/u;
const THOUSANDS_BOUNDARY_PATTERN = /\B(?=(\d{3})+(?!\d))/gu;

export interface FormatDecimalStringOptions {
	/** Drop trailing fraction zeros, and the decimal sign once no fraction digit is left. */
	trimTrailingZeros?: boolean;
}

/**
 * Write an exact decimal string with the grouping and decimal signs of the number-format setting.
 * The caller keeps the digits: round or truncate first (for example `Big#toFixed(4, Big.roundDown)`)
 * and pass the plain decimal string; only the separators change, so values beyond double precision
 * and the caller's rounding direction survive. Redundant leading zeros are dropped, because grouping
 * "0005" would read as 0,005. Anything that is not a plain decimal string returns the fallback
 * placeholder.
 * @example formatDecimalString("-1234.50") -> "-1,234.50" with 1,234.56, "-1.234,50" with 1.234,56
 * @example formatDecimalString("12.3400", { trimTrailingZeros: true }) -> "12.34"
 */
export function formatDecimalString(value: string | null | undefined, opts?: FormatDecimalStringOptions): string {
	const match = typeof value === "string" ? PLAIN_DECIMAL_PATTERN.exec(value) : null;
	if (!match) return FALLBACK_VALUE_PLACEHOLDER;
	const [, sign, integer, fraction = ""] = match;
	const separators = getActiveNumberSeparators();
	const digits = opts?.trimTrailingZeros ? fraction.replace(/0+$/u, "") : fraction;
	const grouped = integer.replace(/^0+(?=\d)/u, "").replace(THOUSANDS_BOUNDARY_PATTERN, separators.group);
	return digits ? `${sign}${grouped}${separators.decimal}${digits}` : `${sign}${grouped}`;
}

/**
 * The number formatters for components, hooks and the presentation helpers they call during render.
 * Every number-format change produces a new object with new function identities, so React Compiler
 * recomputes each cached value that calls one of them; like the module-level functions, they read the
 * active setting when called. Helpers receive this object as an argument instead of importing the
 * module-level functions (ADR 0036).
 */
export interface NumberFormatters {
	formatDecimalString: typeof formatDecimalString;
	formatLiquidationPrice: typeof formatLiquidationPrice;
	formatNumber: typeof formatNumber;
	formatPercent: typeof formatPercent;
	formatPrice: typeof formatPrice;
	formatQuoteAmount: typeof formatQuoteAmount;
	formatSlippageBps: typeof formatSlippageBps;
	formatToken: typeof formatToken;
	formatUSD: typeof formatUSD;
	/** For a signed number a helper composes itself, such as `-$12.50`: unchanged left to right. */
	markLeadingSign: (text: string) => string;
}

function createNumberFormatters(): NumberFormatters {
	return {
		formatDecimalString: (...args) => formatDecimalString(...args),
		formatLiquidationPrice: (...args) => formatLiquidationPrice(...args),
		formatNumber: (...args) => formatNumber(...args),
		formatPercent: (...args) => formatPercent(...args),
		formatPrice: (...args) => formatPrice(...args),
		formatQuoteAmount: (...args) => formatQuoteAmount(...args),
		formatSlippageBps: (...args) => formatSlippageBps(...args),
		formatToken: (...args) => formatToken(...args),
		formatUSD: (...args) => formatUSD(...args),
		markLeadingSign: (text) => text,
	};
}

const LEFT_TO_RIGHT_MARK = "\u200E";
const SIGNED_NUMBER_PATTERN = /^[+\-\u2212]\D{0,4}\d/u;

/**
 * A plus or minus sign that starts a number has no direction of its own, so a right-to-left line
 * draws it after the digits ("18.50%+"). CLDR writes Arabic numbers with Latin digits behind a
 * left-to-right mark for this reason; a placeholder such as "-" has no digit and stays unmarked.
 */
function markSignedNumber<Text extends string | null>(text: Text): Text {
	return typeof text === "string" && SIGNED_NUMBER_PATTERN.test(text) ? (`${LEFT_TO_RIGHT_MARK}${text}` as Text) : text;
}

function createRightToLeftNumberFormatters(formatters: NumberFormatters): NumberFormatters {
	return {
		formatDecimalString: (...args) => markSignedNumber(formatters.formatDecimalString(...args)),
		formatLiquidationPrice: (...args) => markSignedNumber(formatters.formatLiquidationPrice(...args)),
		formatNumber: (...args) => markSignedNumber(formatters.formatNumber(...args)),
		formatPercent: (...args) => markSignedNumber(formatters.formatPercent(...args)),
		formatPrice: (...args) => markSignedNumber(formatters.formatPrice(...args)),
		formatQuoteAmount: (...args) => markSignedNumber(formatters.formatQuoteAmount(...args)),
		formatSlippageBps: (...args) => markSignedNumber(formatters.formatSlippageBps(...args)),
		formatToken: (...args) => markSignedNumber(formatters.formatToken(...args)),
		formatUSD: (...args) => markSignedNumber(formatters.formatUSD(...args)),
		markLeadingSign: (text) => markSignedNumber(text),
	};
}

let numberFormatters = createNumberFormatters();
let numberFormattersRevision = getNumberFormatRevision();

/** The current formatters, for code that runs outside render (event handlers, effects, exports). */
export function getNumberFormatters(): NumberFormatters {
	const revision = getNumberFormatRevision();
	if (revision !== numberFormattersRevision) {
		numberFormattersRevision = revision;
		numberFormatters = createNumberFormatters();
	}
	return numberFormatters;
}

let rightToLeftNumberFormatters: { source: NumberFormatters; formatters: NumberFormatters } | null = null;

function getRightToLeftNumberFormatters(source: NumberFormatters): NumberFormatters {
	if (rightToLeftNumberFormatters?.source !== source) {
		rightToLeftNumberFormatters = { source, formatters: createRightToLeftNumberFormatters(source) };
	}
	return rightToLeftNumberFormatters.formatters;
}

function subscribeInterfaceLocale(listener: () => void): () => void {
	return i18n.on("change", listener);
}

function isRightToLeftInterface(): boolean {
	return isRtlLocale(i18n.locale);
}

/**
 * Subscribes the caller to the number-format setting and to the interface direction, and returns the
 * formatters for this render. A right-to-left interface gets its own set, with new function
 * identities, whose signed results start with a left-to-right mark.
 */
export function useNumberFormat(): NumberFormatters {
	const formatters = useSyncExternalStore(subscribeNumberFormatChange, getNumberFormatters, getNumberFormatters);
	const rightToLeft = useSyncExternalStore(subscribeInterfaceLocale, isRightToLeftInterface, isRightToLeftInterface);
	return rightToLeft ? getRightToLeftNumberFormatters(formatters) : formatters;
}

/**
 * Format duration in minutes to human-readable string
 * @example formatDuration(5) -> "5m"
 * @example formatDuration(60) -> "1h"
 * @example formatDuration(90) -> "1h 30m"
 * @example formatDuration(1440) -> "24h"
 * @example formatDuration(1500) -> "1d 1h"
 * @example formatDuration(2880) -> "2d"
 */
export function formatDuration(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	if (minutes < 1440) {
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
	}
	const days = Math.floor(minutes / 1440);
	const remainingHours = Math.floor((minutes % 1440) / 60);
	return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

/**
 * Format a millisecond elapsed duration as a clock-style string.
 * @example formatClockDuration(65_000) -> "00:01:05"
 */
export function formatClockDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
