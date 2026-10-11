import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cctpMessages = [
	"A previous deposit authorization is still active, but its submission could not be confirmed. Another deposit is blocked until that authorization is resolved or expires.",
	"The wallet did not return a transaction hash, so the deposit could not be confirmed. A signed authorization may still be active. Check your wallet activity before retrying.",
	"~2 minutes",
	"Available {balance} USDC is below the minimum deposit. Send at least {minimumDeposit}.",
	"Gas-sponsored CCTP deposits are not enabled for this network.",
	"Important: send only native USDC on Arbitrum to this address. Other assets, including USDC.e, and transfers on other networks will not be credited to your trading account.",
	"Legacy Bridge2 deposits are no longer accepted. Deposits are paused.",
	"Legacy Bridge2 deposits are no longer accepted. This deposit was not submitted.",
	"Unable to verify the CCTP authorization.",
	"Processing time",
	"Circle fees changed. Review the updated fee, then submit again.",
	"Unable to verify the current Circle CCTP fee and Fast Transfer capacity.",
	"Up to {cctpFee} USDC in fees will be deducted from your deposit.",
	"USDC on HyperCore",
] as const;

function escapePoMessage(message: string): string {
	return message.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

describe("CCTP deposit catalogs", () => {
	for (const locale of ["ar", "en", "es", "fr", "hi", "zh"]) {
		const catalog = readFileSync(new URL(`../../locales/${locale}/messages.po`, import.meta.url), "utf8");

		for (const message of cctpMessages) {
			it(`${locale} explicitly translates ${message}`, () => {
				const escapedMessage = escapePoMessage(message);
				const entry = catalog.match(new RegExp(`msgid "${escapedMessage}"\\nmsgstr "([^"]*)"`));
				expect(entry?.[1]).toBeTruthy();
			});
		}
	}
});
