import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cctpMessages = [
	"Gas-sponsored CCTP deposits are not enabled for this network.",
	"After USDC arrives, your embedded wallet will authorize a gas-sponsored Circle CCTP deposit.",
	"Important: this address can only receive native USDC on Arbitrum. Do not send USDC.e or assets from other networks. Minimum deposit is {minimumDeposit}.",
	"Legacy Bridge2 deposits are no longer accepted. Automatic deposits are paused.",
	"Legacy Bridge2 deposits are no longer accepted. Deposits are paused.",
	"Legacy Bridge2 deposits are no longer accepted. This deposit was not submitted.",
	"Unable to verify the CCTP authorization.",
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
