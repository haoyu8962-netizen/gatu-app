import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const translations = {
	ar: {
		"Spot Dust Conversion": "تحويل أرصدة التداول الفوري المتبقية",
		"TWAP Slice": "شريحة من أمر TWAP",
		"Vault Close": "إغلاق مركز الخزنة",
	},
	es: {
		"Spot Dust Conversion": "Conversión de saldos residuales spot",
		"TWAP Slice": "Tramo de orden TWAP",
		"Vault Close": "Cierre de posición de la bóveda",
	},
	fr: {
		"Spot Dust Conversion": "Conversion des soldes spot résiduels",
		"TWAP Slice": "Tranche d'ordre TWAP",
		"Vault Close": "Clôture d'une position du coffre",
	},
	ja: {
		"Spot Dust Conversion": "現物の少額残高を変換",
		"TWAP Slice": "TWAP 分割注文",
		"Vault Close": "ボールトのポジション決済",
	},
	hi: {
		"Spot Dust Conversion": "शेष स्पॉट बैलेंस का रूपांतरण",
		"TWAP Slice": "TWAP ऑर्डर का भाग",
		"Vault Close": "वॉल्ट पोज़िशन बंद करना",
	},
} as const;

describe("Hyperliquid order-label catalogs", () => {
	for (const [locale, messages] of Object.entries(translations)) {
		const catalog = readFileSync(new URL(`../../locales/${locale}/messages.po`, import.meta.url), "utf8");

		for (const [message, translation] of Object.entries(messages)) {
			it(`${locale} translates ${message}`, () => {
				expect(catalog).toContain(`msgid "${message}"\nmsgstr "${translation}"`);
			});
		}
	}
});
