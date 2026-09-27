import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const REACTIVE_COMPONENTS = [
	"components/pages/application-error-page.tsx",
	"components/pages/not-found-page.tsx",
	"components/trade/chart/chart-panel.tsx",
	"components/trade/chart/funding-history-chart.tsx",
	"components/trade/chart/funding-history-load-boundary.tsx",
	"components/trade/chart/funding-history-panel.tsx",
	"components/trade/header/desktop-utilities-menu.tsx",
	"components/trade/chart/token-selector.tsx",
	"components/trade/header/top-nav.tsx",
	"components/trade/header/language-switcher.tsx",
	"components/trade/header/user-menu.tsx",
	"components/trade/header/theme-toggle.tsx",
	"components/trade/chart/token-selector-content.tsx",
	"components/trade/chart/tradingview-chart.tsx",
	"components/trade/components/market-asset-info.tsx",
	"components/trade/components/mobile-agent-qr-scanner.tsx",
	"components/trade/components/mobile-agent-sync-modal.tsx",
	"components/trade/components/spot-swap-modal.tsx",
	"components/trade/components/trading-action-button.tsx",
	"components/trade/footer/footer-bar.tsx",
	"components/trade/header/favorites-strip.tsx",
	"components/trade/header/theme-toggle.tsx",
	"components/trade/market-overview.tsx",
	"components/trade/mobile/mobile-header.tsx",
	"components/trade/mobile/mobile-market-bar.tsx",
	"components/trade/mobile/offline-banner.tsx",
	"components/trade/mobile/mobile-account-view.tsx",
	"components/trade/mobile/mobile-book-view.tsx",
	"components/trade/mobile/mobile-funding-tab.tsx",
	"components/trade/mobile/mobile-history-tab.tsx",
	"components/trade/mobile/mobile-nav-drawer.tsx",
	"components/trade/mobile/mobile-orders-history-tab.tsx",
	"components/trade/mobile/mobile-orders-tab.tsx",
	"components/trade/mobile/mobile-position-card.tsx",
	"components/trade/mobile/mobile-positions-tab.tsx",
	"components/trade/mobile/mobile-trade-layout.tsx",
	"components/trade/mobile/mobile-trade-view.tsx",
	"components/trade/mobile/mobile-twap-fill-history-list.tsx",
	"components/trade/mobile/mobile-twap-tab.tsx",
	"components/trade/orderbook/orderbook-row.tsx",
	"components/trade/positions/balances-tab.tsx",
	"components/trade/positions/funding-tab.tsx",
	"components/trade/positions/history-tab.tsx",
	"components/trade/positions/orders-history-tab.tsx",
	"components/trade/positions/orders-tab.tsx",
	"components/trade/positions/position-close-sizing-controls.tsx",
	"components/trade/positions/position-inline-actions.tsx",
	"components/trade/positions/position-isolated-margin-modal.tsx",
	"components/trade/positions/position-market-close-modal.tsx",
	"components/trade/positions/position-pnl-share-modal.tsx",
	"components/trade/positions/position-row.tsx",
	"components/trade/positions/position-tpsl-modal.tsx",
	"components/trade/positions/positions-tab.tsx",
	"components/trade/positions/send-modal.tsx",
	"components/trade/positions/transfer-modal.tsx",
	"components/trade/positions/twap-fill-history-table.tsx",
	"components/trade/positions/twap-tab.tsx",
	"components/trade/testnet-banner.tsx",
	"components/trade/tradebox/account-panel.tsx",
	"components/trade/tradebox/deposit-modal.tsx",
	"components/trade/tradebox/deposit/amount-input.tsx",
	"components/trade/tradebox/deposit/deposit-form.tsx",
	"components/trade/tradebox/deposit/funding-address-card.tsx",
	"components/trade/tradebox/deposit/withdraw-form.tsx",
	"components/trade/tradebox/embedded-deposit-auto-bridge.tsx",
	"components/trade/tradebox/leverage-editor.tsx",
	"components/trade/tradebox/leverage-modal.tsx",
	"components/trade/tradebox/leverage-position-limit-row.tsx",
	"components/trade/tradebox/leverage-slider.tsx",
	"components/trade/tradebox/margin-mode-modal.tsx",
	"components/trade/tradebox/order-toast.tsx",
	"components/trade/tradebox/price-input-with-percent.tsx",
	"components/trade/tradebox/tp-sl-section.tsx",
	"components/trade/tradebox/trade-form-scale.tsx",
	"components/trade/tradebox/trade-form-tif.tsx",
	"components/trade/tradebox/trade-form-twap.tsx",
	"components/trade/tradebox/trade-header.tsx",
	"components/trade/tradebox/trade-form-fields.tsx",
	"components/trade/tradebox/trade-form-tif.tsx",
	"hooks/trade/use-account-overview-labels.ts",
	"hooks/trade/use-funds-action-availability.ts",
	"hooks/trade/use-order-entry-data.ts",
	"hooks/trade/use-order-display-labels.ts",
	"hooks/trade/use-position-close-all-submit.ts",
	"hooks/trade/use-position-limit-close-submit.ts",
	"hooks/trade/use-position-market-close-submit.ts",
	"hooks/trade/use-position-reverse-submit.ts",
	"hooks/trade/use-twap-fill-history-csv.ts",
];

describe("live localization source contract", () => {
	it("keeps the Chinese terminal labels in the production catalog", () => {
		const catalog = readFileSync(resolve(__dirname, "../../locales/zh/messages.po"), "utf8");
		for (const [source, translated] of [
			["Post Only", "只挂单"],
			["Connect your wallet to view positions.", "连接钱包查看仓位。"],
			["Switch to dark mode", "切换到深色模式"],
			["Switch to light mode", "切换到浅色模式"],
		]) {
			expect(catalog).toContain(`msgid ${JSON.stringify(source)}\nmsgstr ${JSON.stringify(translated)}`);
		}
	});

	it.each(REACTIVE_COMPONENTS)("translates %s during render", (relativePath) => {
		const source = readFileSync(resolve(__dirname, "../..", relativePath), "utf8");

		expect(nonDescriptorCoreMacroImports(source)).toEqual([]);
		expect(source).not.toContain("UI_TEXT");
		expect(source).toContain("@lingui/react/macro");
	});
});

// Core msg/defineMessage retain semantics for later translation. Core t/plural/select
// eagerly produce strings and must not replace a locale-subscribed render translator.
function nonDescriptorCoreMacroImports(source: string): string[] {
	const file = ts.createSourceFile("presentation.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const violations: string[] = [];
	for (const statement of file.statements) {
		if (
			!ts.isImportDeclaration(statement) ||
			!ts.isStringLiteral(statement.moduleSpecifier) ||
			statement.moduleSpecifier.text !== "@lingui/core/macro"
		)
			continue;
		const clause = statement.importClause;
		if (clause?.isTypeOnly) continue;
		if (!clause) {
			violations.push("side-effect");
			continue;
		}
		if (clause.name) violations.push("default");
		const bindings = clause.namedBindings;
		if (!bindings) continue;
		if (ts.isNamespaceImport(bindings)) {
			violations.push("namespace");
			continue;
		}
		for (const binding of bindings.elements) {
			if (binding.isTypeOnly) continue;
			const imported = (binding.propertyName ?? binding.name).text;
			if (imported !== "msg" && imported !== "defineMessage") violations.push(imported);
		}
	}
	return violations;
}

describe("lazy descriptor imports in reactive presentation", () => {
	it.each([
		'import { msg } from "@lingui/core/macro";',
		'import { msg as describeMessage, defineMessage } from "@lingui/core/macro";',
	])("allows locale-independent descriptors: %s", (coreImport) => {
		expect(nonDescriptorCoreMacroImports(coreImport)).toEqual([]);
	});

	it.each([
		['import { t } from "@lingui/core/macro";', "t"],
		['import { t as translate } from "@lingui/core/macro";', "t"],
		['import { msg, t } from "@lingui/core/macro";', "t"],
		['import { plural } from "@lingui/core/macro";', "plural"],
		['import * as core from "@lingui/core/macro";', "namespace"],
		['import core from "@lingui/core/macro";', "default"],
	])("rejects imperative core imports even alongside a React locale subscription: %s", (coreImport, violation) => {
		const source = `${coreImport}
import { useLingui } from "@lingui/react/macro";
function View() { const { t } = useLingui(); return t({ id: "label" }); }`;
		expect(nonDescriptorCoreMacroImports(source)).toEqual([violation]);
	});
});

const PURE_PRESENTATION_VIEWS = [
	"../dashboard/dashboard-frame-view.tsx",
	"mobile/mobile-token-selector-view.tsx",
	"mobile/mobile-positions-tabs-view.tsx",
	"mobile/mobile-trade-available-view.tsx",
	"mobile/mobile-trade-summary-view.tsx",
	"mobile/mobile-trade-size-view.tsx",
	"mobile/mobile-terminal-frame-view.tsx",
	"mobile/mobile-trade-frame-view.tsx",
	"mobile/mobile-header-view.tsx",
	"mobile/mobile-wallet-cta-view.tsx",
	"mobile/mobile-market-bar-view.tsx",
	"mobile/mobile-trade-header-view.tsx",
	"mobile/mobile-bottom-nav-view.tsx",
	"mobile/mobile-book-chrome-view.tsx",
	"mobile/mobile-trade-cta-frame-view.tsx",

	"positions/account-table-header-view.tsx",
	"tradebox/account-overview-view.tsx",
	"tradebox/account-action-button-view.tsx",
	"tradebox/account-panel-frame-view.tsx",
	"components/trade-slider-view.tsx",
	"tradebox/trade-input-frame-view.tsx",
	"tradebox/trade-available-row-view.tsx",
	"tradebox/trade-panel-body-view.tsx",
	"tradebox/trade-control-button-view.tsx",
	"tradebox/trade-percent-frame-view.tsx",
	"tradebox/trade-header-view.tsx",
	"tradebox/trade-size-unit-view.tsx",
	"tradebox/trade-option-checkboxes-view.tsx",
	"tradebox/trade-panel-footer-view.tsx",
	"tradebox/trade-size-slider-row-view.tsx",
	"tradebox/trade-cta-view.tsx",
	"tradebox/order-type-tab-view.tsx",
	"tradebox/trade-form-fields-view.tsx",
	"components/summary-row-view.tsx",
	"header/favorites-strip-view.tsx",
	"header/top-nav-view.tsx",
	"header/nav-menu-trigger-view.tsx",
	"header/header-icon-button-view.tsx",
	"header/wallet-cta-view.tsx",
	"footer/footer-bar-view.tsx",
	"layout/desktop-terminal-frame-view.tsx",
	"chart/token-selector-trigger-view.tsx",
	"components/asset-icon-slot-view.tsx",
	"market-overview-view.tsx",
	"layout/market-header-view.tsx",
	"orderbook/orderbook-panel-view.tsx",
	"orderbook/orderbook-grouping-trigger-view.tsx",
];

it.each(PURE_PRESENTATION_VIEWS)("receives translated presentation props in %s", (path) => {
	const source = readFileSync(resolve(__dirname, "../../components/trade", path), "utf8");
	expect(source).toContain("interface Props");
	expect(source).not.toMatch(/@lingui|use[A-Z]\w*\(|@\/stores|window|document|Date\.|Math\.random/);
});
