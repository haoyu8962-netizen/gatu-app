import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drawerContentVariants, modalPopupVariants, tooltipPopupVariants } from "@sairn/ui";
import { describe, expect, it } from "vitest";
import { menuPopupSelectionSkinClass, menuPopupSkinClass, menuPopupSurfaceClass } from "@/lib/ui/menu-popup-skin";
import { tradingPanelDropdownPopupClass } from "@/lib/ui/trading-dropdown";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_THEME_CSS = readFileSync(resolve(TEST_DIR, "../..", "styles.css"), "utf8");
const SHARED_THEME_CSS = readFileSync(resolve(TEST_DIR, "../../../../..", "packages/ui/src/globals.css"), "utf8");
const TERMINAL_COMPONENTS_DIR = resolve(TEST_DIR, "../..", "components");
const POPOVER_SOURCE = readTerminalComponent("ui/popover.tsx");
const ORDER_TOAST_SOURCE = readTerminalComponent("trade/tradebox/order-toast.tsx");
const ORDER_NOTIFICATION_HOST_SOURCE = readTerminalComponent("trade/order-notification-host.tsx");
const ORDER_NOTIFICATION_SOURCE = readTerminalComponent("trade/order-notification.tsx");
const APP_TOASTER_SOURCE = readTerminalComponent("app-toaster.tsx");
const SONNER_SOURCE = readTerminalComponent("ui/sonner.tsx");
const DESKTOP_UTILITIES_MENU_SOURCE = readTerminalComponent("trade/header/desktop-utilities-menu.tsx");
const TOP_NAV_SOURCE = readTerminalComponent("trade/header/top-nav.tsx");
const USER_MENU_SOURCE = readTerminalComponent("trade/header/user-menu.tsx");
const TOKEN_SELECTOR_POPUP_SOURCE = readTerminalComponent("trade/chart/token-selector-popup.tsx");
const MOBILE_AGENT_QR_SCANNER_SOURCE = readTerminalComponent("trade/components/mobile-agent-qr-scanner.tsx");
const LANGUAGE_SWITCHER_SOURCE = readTerminalComponent("trade/header/language-switcher.tsx");
const TRADING_DROPDOWN_SOURCE = readFileSync(resolve(TEST_DIR, "../..", "lib/ui/trading-dropdown.ts"), "utf8");

describe("modal surface contract", () => {
	it("uses the dedicated modal surface for blocking overlays", () => {
		expect(modalPopupVariants()).toContain("bg-modal");
		expect(drawerContentVariants({ side: "right" })).toContain("bg-modal");
		expect(drawerContentVariants({ side: "top" })).toContain("left-[env(safe-area-inset-left)]");
		expect(drawerContentVariants({ side: "bottom" })).toContain("right-[env(safe-area-inset-right)]");
	});

	it("keeps lightweight overlays on the raised overlay surface", () => {
		expect(tooltipPopupVariants()).toContain("bg-overlay");
		expect(tooltipPopupVariants()).not.toContain("bg-modal");
	});

	it("keeps list cards, table headers and in-panel filters on bg-surface instead of bg-modal", () => {
		const nonModalSources = [
			"mobile/mobile-position-card.tsx",
			"mobile/mobile-orders-tab.tsx",
			"mobile/mobile-twap-tab.tsx",
			"mobile/mobile-twap-history-list.tsx",
			"mobile/mobile-twap-fill-history-list.tsx",
			"mobile/mobile-history-tab.tsx",
			"mobile/mobile-funding-tab.tsx",
			"mobile/mobile-orders-history-tab.tsx",
			"positions/orders-tab.tsx",
			"positions/orders-history-tab.tsx",
			"positions/positions-panel.tsx",
			"positions/position-filter-toolbar.tsx",
			"positions/position-market-filter.tsx",
			"positions/balances-table-styles.ts",
			"positions/balances-tab.tsx",
			"positions/order-inline-edit.tsx",
		];
		for (const path of nonModalSources) {
			const source = readFileSync(resolve(__dirname, "../../components/trade", path), "utf8");
			expect(source, path).not.toContain("bg-modal");
		}
	});

	it("keeps transient terminal layers raised without flattening modal and drawer surfaces", () => {
		expect(POPOVER_SOURCE).toContain("font-sans bg-overlay text-fg");
		expect(ORDER_TOAST_SOURCE).toMatch(/\bbg-overlay(?:\/\d+)?\b/);
		expect(menuPopupSurfaceClass).toBe(
			"rounded-24 border-trading-panel-stroke-card bg-overlay p-1 font-market-close shadow-overlay",
		);
		expect(DESKTOP_UTILITIES_MENU_SOURCE).toContain("cn(menuPopupSurfaceClass,");
		expect(TOP_NAV_SOURCE).toContain("popupClassName={cn(menuPopupSkinClass,");
		expect(USER_MENU_SOURCE).toContain("popupClassName={cn(menuPopupSkinClass,");
		expect(TOKEN_SELECTOR_POPUP_SOURCE).toContain("bg-modal p-0");
		expect(TOKEN_SELECTOR_POPUP_SOURCE).toContain("bg-overlay p-0");
		expect(MOBILE_AGENT_QR_SCANNER_SOURCE).toContain("bg-modal px-6 text-center");
		expect(MOBILE_AGENT_QR_SCANNER_SOURCE).not.toContain("bg-[#0F1A1F]");
		expect(TRADING_DROPDOWN_SOURCE).toContain("menuPopupSelectionSkinClass,");
	});

	it("keeps task content raised inside the shared Sonner host without a second positioning layer", () => {
		expect(ORDER_TOAST_SOURCE).toContain("shadow-overlay");
		expect(ORDER_TOAST_SOURCE).not.toContain("bg-modal");
		expect(ORDER_TOAST_SOURCE).not.toMatch(/\bfixed\b|createPortal|createRoot/);
		expect(ORDER_NOTIFICATION_HOST_SOURCE).toContain("toast.custom(");
		expect(ORDER_NOTIFICATION_HOST_SOURCE).toContain("<OrderNotification ");
		expect(ORDER_NOTIFICATION_SOURCE).toContain("<OrderToast ");
		expect(APP_TOASTER_SOURCE.match(/<Toaster\s*\/>/g)).toHaveLength(1);
		expect(APP_TOASTER_SOURCE.match(/<OrderNotificationGate\s*\/>/g)).toHaveLength(1);
		for (const appearance of ["normal", "success", "error", "warning", "info"]) {
			expect(SONNER_SOURCE).toContain(`"--${appearance}-bg": "var(--bg-overlay)"`);
		}
		expect(SONNER_SOURCE).toContain('zIndex: "var(--z-toast)"');
	});

	it("keeps every terminal menu on one shared skin without important overrides or one-off surface values", () => {
		expect(menuPopupSkinClass).toContain(menuPopupSurfaceClass);
		expect(menuPopupSelectionSkinClass).toContain(menuPopupSkinClass);
		for (const skin of [menuPopupSkinClass, menuPopupSelectionSkinClass, tradingPanelDropdownPopupClass]) {
			expect(skin).not.toContain("!");
			expect(skin).not.toMatch(/rounded-\[|text-\[\d/);
			expect(skin).toContain("[&_[role^=menuitem]]:rounded-16");
			expect(skin).toContain("[&_[role^=menuitem][data-disabled]]:text-fg-disabled");
			expect(skin).toContain("max-[1000px]:[&_[role^=menuitem]]:min-h-11");
		}
		for (const source of [
			LANGUAGE_SWITCHER_SOURCE,
			TOP_NAV_SOURCE.match(/popupClassName=\{[^}]*\}/)?.[0] ?? "",
			USER_MENU_SOURCE.match(/popupClassName=\{[^}]*\}/)?.[0] ?? "",
			DESKTOP_UTILITIES_MENU_SOURCE,
		]) {
			expect(source).not.toMatch(/!rounded|!p-\[|!shadow|!border-|rounded-\[1[02]px\]/);
		}
		expect(LANGUAGE_SWITCHER_SOURCE).toContain("menuPopupSelectionSkinClass,");
		expect(TERMINAL_THEME_CSS).not.toContain("language-settings");
	});

	it("keeps the shared and terminal modal tokens wired to their intended surfaces", () => {
		expect(readCssVariable(SHARED_THEME_CSS, ":root", "--bg-modal")).toBe("#ffffff");
		expect(readCssVariable(SHARED_THEME_CSS, ".dark", "--bg-modal")).toBe("#292b33");
		expect(readCssVariable(SHARED_THEME_CSS, "@theme inline", "--color-modal")).toBe("var(--bg-modal)");

		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--bg-modal")).toBe("#ffffff");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--bg-modal")).toBe("#0f1a1f");
		expect(readCssVariable(TERMINAL_THEME_CSS, "@theme inline", "--color-modal")).toBe("var(--bg-modal)");
	});

	it("keeps the terminal dark overlay and scrim in the terminal hue family instead of the shared navy defaults", () => {
		expect(readCssVariable(SHARED_THEME_CSS, ".dark", "--bg-overlay")).toBe("#292b33");
		expect(readCssVariable(SHARED_THEME_CSS, ".dark", "--fill-overlay")).toBe("#000626a8");

		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--bg-overlay")).toBe("#212d33");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--fill-overlay")).toBe("#03090ca8");
		expect(readCssVariable(TERMINAL_THEME_CSS, "@theme inline", "--color-overlay")).toBe("var(--bg-overlay)");
		expect(readCssVariable(TERMINAL_THEME_CSS, "@theme inline", "--color-scrim")).toBe("var(--fill-overlay)");
	});

	it("keeps market-close status colors exact while separating action and focus roles", () => {
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--market-close-text-strong")).toBe("#1a2330");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--market-close-control-active")).toBe("var(--action)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--market-close-control-active-text")).toBe("var(--on-action)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--market-close-control-focus")).toBe("var(--focus)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--market-close-danger")).toBe("#c73a3a");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--market-close-danger-disabled")).toBe("#efc3bf");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--market-close-warning")).toBe("#7f5c0e");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--market-close-control-active")).toBe("var(--action)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--market-close-control-active-text")).toBe("var(--on-action)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--market-close-control-focus")).toBe("var(--focus)");
		expect(readCssVariable(TERMINAL_THEME_CSS, "@theme inline", "--color-market-close-focus")).toBe(
			"var(--market-close-control-focus)",
		);
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--market-close-danger-text")).toBe(
			"var(--text-inverse-strong)",
		);
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--market-close-warning")).toBe("var(--text-warning)");
	});

	it("keeps legal acceptance states theme-aware", () => {
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--legal-acceptance-disabled-fill")).toBe("#edf1f5");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--legal-acceptance-pending-fill")).toBe("#33505e");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--legal-acceptance-disabled-fill")).toBe(
			"var(--fill-disabled)",
		);
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--legal-acceptance-pending-fill")).toBe("var(--bg-overlay)");
		expect(readCssVariable(TERMINAL_THEME_CSS, "@theme inline", "--color-legal-acceptance-disabled")).toBe(
			"var(--legal-acceptance-disabled-fill)",
		);
		expect(readCssVariable(TERMINAL_THEME_CSS, "@theme inline", "--shadow-legal-acceptance")).toBe(
			"var(--legal-acceptance-shadow)",
		);
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

function readTerminalComponent(relativePath: string): string {
	return readFileSync(resolve(TERMINAL_COMPONENTS_DIR, relativePath), "utf8");
}
