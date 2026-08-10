import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const translations = {
	ar: { Ask: "بيع", Bid: "شراء", "No orders": "لا توجد أوامر" },
	en: { Ask: "Ask", Bid: "Bid", "No orders": "No orders" },
	es: { Ask: "Venta", Bid: "Compra", "No orders": "Sin órdenes" },
	fr: { Ask: "Vente", Bid: "Achat", "No orders": "Aucun ordre" },
	hi: { Ask: "बिक्री", Bid: "खरीद", "No orders": "कोई ऑर्डर नहीं" },
	zh: { Ask: "卖盘", Bid: "买盘", "No orders": "暂无挂单" },
} as const;

describe("orderbook catalogs", () => {
	for (const [locale, messages] of Object.entries(translations)) {
		const catalog = readFileSync(new URL(`../../locales/${locale}/messages.po`, import.meta.url), "utf8");

		for (const [message, translation] of Object.entries(messages)) {
			it(`${locale} translates ${message}`, () => {
				expect(catalog).toContain(`msgid "${message}"\nmsgstr "${translation}"`);
			});
		}
	}
});
