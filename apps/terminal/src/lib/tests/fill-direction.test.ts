import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { beforeEach, describe, expect, it } from "vitest";
import { getFillDirectionPresentation, getFillDirectionTone } from "@/lib/trade/fill-direction";

const OWNER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const COUNTERPARTY = "0x9999999999999999999999999999999999999999";

function present(dir: string, liquidation?: { liquidatedUser?: string } | null, owner: string | null = OWNER) {
	return getFillDirectionPresentation({ dir, liquidation }, owner, (descriptor) => i18n._(descriptor));
}

describe("fill direction presentation", () => {
	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("shows ordinary fills with their direction and tone", () => {
		expect(present("Open Long")).toEqual({ label: "Open Long", tone: "open" });
		expect(present("Close Short")).toEqual({ label: "Close Short", tone: "other" });
		expect(present("Long > Short")).toEqual({ label: "Long > Short", tone: "other" });
		expect(present("Buy")).toEqual({ label: "Buy", tone: "other" });
	});

	it("marks the account's own liquidation, comparing addresses without case", () => {
		expect(present("Close Long", { liquidatedUser: OWNER.toUpperCase().replace("0X", "0x") })).toEqual({
			label: "Market Order Liquidation: Close Long",
			tone: "liquidation",
		});
		expect(present("Close Long", {})).toEqual({ label: "Market Order Liquidation: Close Long", tone: "liquidation" });
	});

	it("shows a fill against another account's liquidation as a price-improved ordinary fill", () => {
		expect(present("Open Long", { liquidatedUser: COUNTERPARTY })).toEqual({
			label: "Open Long (Price Improved)",
			tone: "open",
		});
		expect(present("Open Long", { liquidatedUser: COUNTERPARTY }, null).tone).toBe("open");
		expect(getFillDirectionTone({ dir: "Close Short", liquidation: { liquidatedUser: COUNTERPARTY } }, OWNER)).toBe(
			"other",
		);
	});

	it("names protocol liquidations the way the official terminal does", () => {
		expect(present("Liquidated Cross Long")).toEqual({
			label: "Backstop Liquidation: Cross Long",
			tone: "liquidation",
		});
		expect(present("Backstop Borrow Liquidation")).toEqual({ label: "Full Borrow Liquidation", tone: "liquidation" });
		expect(present("Partial Borrow Liquidation")).toEqual({
			label: "Partial Borrow Liquidation",
			tone: "liquidation",
		});
		expect(present("Auto-Deleveraging")).toEqual({ label: "Auto-Deleveraging", tone: "liquidation" });
		expect(getFillDirectionTone({ dir: "Auto-Deleveraging" }, OWNER)).toBe("liquidation");
	});

	it("translates spot and position-flip directions as well as opens and closes", () => {
		const messageId = (message: string) => createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
		i18n.loadAndActivate({
			locale: "zh",
			messages: {
				[messageId("Buy")]: "买入",
				[messageId("Sell")]: "卖出",
				[messageId("Long > Short")]: "多转空",
				[messageId("Short > Long")]: "空转多",
			},
		});

		expect(present("Buy").label).toBe("买入");
		expect(present("Sell").label).toBe("卖出");
		expect(present("Long > Short").label).toBe("多转空");
		expect(present("Short > Long").label).toBe("空转多");
	});

	it("keeps an unknown exchange direction readable", () => {
		expect(present("Spot Dust Conversion")).toEqual({ label: "Spot Dust Conversion", tone: "other" });
	});
});
