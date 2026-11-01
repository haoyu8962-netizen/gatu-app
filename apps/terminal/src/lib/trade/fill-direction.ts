import { msg } from "@lingui/core/macro";
import type { Translate } from "@/lib/translate";

export type FillDirectionTone = "liquidation" | "open" | "other";

export interface FillDirectionInput {
	dir: string;
	liquidation?: { liquidatedUser?: string } | null;
}

export interface FillDirectionPresentation {
	label: string;
	tone: FillDirectionTone;
}

const BACKSTOP_LIQUIDATION_PREFIX = "Liquidated ";

function translateDirection(direction: string, translate: Translate): string {
	switch (direction) {
		case "Open Long":
			return translate(msg`Open Long`);
		case "Close Long":
			return translate(msg`Close Long`);
		case "Open Short":
			return translate(msg`Open Short`);
		case "Close Short":
			return translate(msg`Close Short`);
		case "Buy":
			return translate(msg`Buy`);
		case "Sell":
			return translate(msg`Sell`);
		case "Long > Short":
			return translate(msg`Long > Short`);
		case "Short > Long":
			return translate(msg`Short > Long`);
		default:
			return direction;
	}
}

function getDirectionTone(direction: string): FillDirectionTone {
	return direction === "Open Long" || direction === "Open Short" ? "open" : "other";
}

function isProtocolLiquidationDirection(direction: string): boolean {
	return (
		direction.startsWith(BACKSTOP_LIQUIDATION_PREFIX) ||
		direction === "Backstop Borrow Liquidation" ||
		direction === "Partial Borrow Liquidation" ||
		direction === "Auto-Deleveraging"
	);
}

function isOwnLiquidation(fill: FillDirectionInput, owner: string | null | undefined): boolean {
	if (!fill.liquidation) return false;
	const liquidatedUser = fill.liquidation.liquidatedUser;
	return !liquidatedUser || (!!owner && liquidatedUser.toLowerCase() === owner.toLowerCase());
}

/** Whether a fill is the account's own liquidation, a protocol liquidation or an ordinary fill. */
export function getFillDirectionTone(fill: FillDirectionInput, owner: string | null | undefined): FillDirectionTone {
	if (isProtocolLiquidationDirection(fill.dir) || isOwnLiquidation(fill, owner)) return "liquidation";
	return getDirectionTone(fill.dir);
}

/**
 * How a fill's direction reads in the history tables, as on the official terminal. A fill only
 * counts as the account's own liquidation when the exchange names no other liquidated user; a fill
 * against someone else's liquidation is an ordinary fill at an improved price.
 */
export function getFillDirectionPresentation(
	fill: FillDirectionInput,
	owner: string | null | undefined,
	translate: Translate,
): FillDirectionPresentation {
	const { dir } = fill;
	if (dir.startsWith(BACKSTOP_LIQUIDATION_PREFIX)) {
		const direction = dir.slice(BACKSTOP_LIQUIDATION_PREFIX.length);
		return { label: translate(msg`Backstop Liquidation: ${direction}`), tone: "liquidation" };
	}
	if (dir === "Backstop Borrow Liquidation")
		return { label: translate(msg`Full Borrow Liquidation`), tone: "liquidation" };
	if (dir === "Partial Borrow Liquidation") {
		return { label: translate(msg`Partial Borrow Liquidation`), tone: "liquidation" };
	}
	if (dir === "Auto-Deleveraging") return { label: translate(msg`Auto-Deleveraging`), tone: "liquidation" };

	const direction = translateDirection(dir, translate);
	if (!fill.liquidation) return { label: direction, tone: getDirectionTone(dir) };
	if (isOwnLiquidation(fill, owner)) {
		return { label: translate(msg`Market Order Liquidation: ${direction}`), tone: "liquidation" };
	}
	return { label: translate(msg`${direction} (Price Improved)`), tone: getDirectionTone(dir) };
}
