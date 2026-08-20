import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const EXPECTED_TRANSLATIONS = {
	en: {
		"Cross Maintenance Margin": "Cross Maintenance Margin",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"Transfers between Spot and Perps are unavailable in shared-balance account modes.",
	},
	zh: {
		"Cross Maintenance Margin": "全仓维持保证金",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"共享余额账户模式下无法在现货与永续之间划转。",
	},
	es: {
		"Cross Maintenance Margin": "Margen de mantenimiento cruzado",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"Las transferencias entre Spot y Perps no están disponibles en los modos de cuenta con saldo compartido.",
	},
	fr: {
		"Cross Maintenance Margin": "Marge de maintenance croisée",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"Les transferts entre Spot et Perps ne sont pas disponibles pour les comptes à solde partagé.",
	},
	ar: {
		"Cross Maintenance Margin": "هامش الصيانة المتقاطع",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"لا تتوفر التحويلات بين Spot وPerps في أوضاع الحساب ذات الرصيد المشترك.",
	},
	hi: {
		"Cross Maintenance Margin": "क्रॉस मेंटेनेंस मार्जिन",
		"Transfers between Spot and Perps are unavailable in shared-balance account modes.":
			"साझा-बैलेंस खाता मोड में Spot और Perps के बीच ट्रांसफ़र उपलब्ध नहीं हैं।",
	},
} as const;

describe("account panel catalogs", () => {
	for (const [locale, messages] of Object.entries(EXPECTED_TRANSLATIONS)) {
		it(`keeps whole account-risk phrases translated in ${locale}`, () => {
			const catalog = readFileSync(new URL(`../../locales/${locale}/messages.po`, import.meta.url), "utf8");
			for (const [message, translation] of Object.entries(messages)) {
				expect(catalog).toContain(`msgid "${message}"\nmsgstr "${translation}"`);
			}
		});
	}
});
