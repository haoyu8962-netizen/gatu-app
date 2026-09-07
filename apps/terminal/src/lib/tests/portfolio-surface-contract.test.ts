import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_STYLES = readFileSync(resolve(TEST_DIR, "../..", "styles.css"), "utf8");
const PORTFOLIO_PAGE = readFileSync(resolve(TEST_DIR, "../..", "components/portfolio/portfolio-page.tsx"), "utf8");
const DEPOSIT_MODAL = readFileSync(resolve(TEST_DIR, "../..", "components/trade/tradebox/deposit-modal.tsx"), "utf8");

describe("portfolio surface contract", () => {
	it("keeps the portfolio canvas separate from its raised content panels", () => {
		expect(readCssVariable(TERMINAL_STYLES, ":root", "--bg-dashboard-canvas")).toBe("#f1f3f6");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--bg-dashboard-canvas")).toBe("#04251f");
		expect(readCssVariable(TERMINAL_STYLES, ":root", "--bg-portfolio-canvas")).toBe("var(--bg-dashboard-canvas)");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--bg-portfolio-canvas")).toBe("var(--bg-dashboard-canvas)");
		expect(readCssVariable(TERMINAL_STYLES, "@theme inline", "--color-dashboard-canvas")).toBe(
			"var(--bg-dashboard-canvas)",
		);
		expect(readCssVariable(TERMINAL_STYLES, "@theme inline", "--color-portfolio-canvas")).toBe(
			"var(--bg-portfolio-canvas)",
		);
		expect(PORTFOLIO_PAGE).toContain("bg-portfolio-canvas");
		expect(PORTFOLIO_PAGE).toContain("rounded-12 bg-surface");
	});

	it("exposes transfer history only through the portfolio account activity surface", () => {
		expect(PORTFOLIO_PAGE).toContain("transfersContent={<MobileAccountTransfersTab");
		expect(PORTFOLIO_PAGE).toContain("<PositionsPanel includeTransfers autoHeight={isConnected} />");
	});

	it("keeps Send available in the responsive portfolio toolbar", () => {
		expect(PORTFOLIO_PAGE).toContain("useSendModalActions");
		expect(PORTFOLIO_PAGE).toContain("<Trans>Send</Trans>");
	});

	it("keeps the existing account-mode dialog reachable from the portfolio toolbar", () => {
		expect(PORTFOLIO_PAGE).toContain("<Trans>Account mode</Trans>");
		expect(PORTFOLIO_PAGE).toContain("<AccountModeModal");
		expect(PORTFOLIO_PAGE).toContain("canChange={accountModeControl.canSet}");
	});

	it("keeps unavailable fund actions fail-closed and exposes persistent reasons", () => {
		expect(PORTFOLIO_PAGE).toContain("<Trans>Unavailable actions</Trans>");
		expect(PORTFOLIO_PAGE).toContain('aria-live="polite"');
		expect(PORTFOLIO_PAGE).toContain("aria-describedby={getUnavailableReasonId(");
		expect(PORTFOLIO_PAGE).toContain("disabled={modeDependentFundsActionsDisabled}");
		expect(PORTFOLIO_PAGE).toContain("disabled={transferDisabled}");
		expect(PORTFOLIO_PAGE).toContain("disabled={!fundsActionAvailability.withdrawal.available}");
		expect(PORTFOLIO_PAGE).toContain("disabled={depositDisabled}");
		expect(PORTFOLIO_PAGE).toContain('? () => openDepositModal("withdraw")');
		expect(PORTFOLIO_PAGE).toContain(
			'onClick={depositAvailability.available ? () => openDepositModal("deposit") : undefined}',
		);
	});

	it("uses the default withdrawal account instead of the last selected HIP-3 market", () => {
		expect(DEPOSIT_MODAL).toContain("useDefaultDexBalances");
		expect(DEPOSIT_MODAL).not.toContain("useSelectedDexBalances");
	});
});

function readCssVariable(source: string, selector: string, variable: string): string | undefined {
	const selectorStart = source.indexOf(`${selector} {`);
	if (selectorStart === -1) return undefined;

	const blockStart = source.indexOf("{", selectorStart);
	const blockEnd = source.indexOf("}", blockStart);
	if (blockStart === -1 || blockEnd === -1) return undefined;

	const declaration = new RegExp(`${variable}:\\s*([^;]+);`).exec(source.slice(blockStart + 1, blockEnd));
	return declaration?.[1]?.trim();
}
