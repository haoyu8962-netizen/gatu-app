import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drawerContentVariants, modalPopupVariants, tooltipPopupVariants } from "@gatu/ui";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_THEME_CSS = readFileSync(resolve(TEST_DIR, "../..", "styles.css"), "utf8");
const SHARED_THEME_CSS = readFileSync(resolve(TEST_DIR, "../../../../..", "packages/ui/src/globals.css"), "utf8");
const TERMINAL_COMPONENTS_DIR = resolve(TEST_DIR, "../..", "components");
const POPOVER_SOURCE = readTerminalComponent("ui/popover.tsx");
const ORDER_TOAST_SOURCE = readTerminalComponent("trade/tradebox/order-toast.tsx");
const DESKTOP_UTILITIES_MENU_SOURCE = readTerminalComponent("trade/header/desktop-utilities-menu.tsx");
const TOP_NAV_SOURCE = readTerminalComponent("trade/header/top-nav.tsx");
const USER_MENU_SOURCE = readTerminalComponent("trade/header/user-menu.tsx");
const TOKEN_SELECTOR_POPUP_SOURCE = readTerminalComponent("trade/chart/token-selector-popup.tsx");
const MOBILE_AGENT_QR_SCANNER_SOURCE = readTerminalComponent("trade/components/mobile-agent-qr-scanner.tsx");
const TRADING_DROPDOWN_SOURCE = readFileSync(resolve(TEST_DIR, "../..", "lib/ui/trading-dropdown.ts"), "utf8");
const POSITION_ACTIONS_DROPDOWN_SOURCE = readTerminalComponent("trade/positions/position-actions-dropdown.tsx");

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

	it("keeps transient terminal layers raised without flattening modal and drawer surfaces", () => {
		expect(POPOVER_SOURCE).toContain("font-sans bg-overlay text-fg");
		expect(ORDER_TOAST_SOURCE).toContain('"bg-overlay/95 backdrop-blur-sm"');
		expect(DESKTOP_UTILITIES_MENU_SOURCE).toContain("bg-overlay p-2");
		expect(TOP_NAV_SOURCE.match(/popupClassName="[^"]*bg-overlay[^"]*"/g)).toHaveLength(2);
		expect(USER_MENU_SOURCE).toContain("bg-overlay p-1");
		expect(TOKEN_SELECTOR_POPUP_SOURCE).toContain("bg-modal p-0");
		expect(TOKEN_SELECTOR_POPUP_SOURCE).toContain("bg-overlay p-0");
		expect(MOBILE_AGENT_QR_SCANNER_SOURCE).toContain("bg-modal px-6 text-center");
		expect(MOBILE_AGENT_QR_SCANNER_SOURCE).not.toContain("bg-[#0F1A1F]");
		expect(TRADING_DROPDOWN_SOURCE).toContain("bg-overlay p-1");
		expect(POSITION_ACTIONS_DROPDOWN_SOURCE).toContain("bg-overlay p-1.5 shadow-overlay");
	});

	it("keeps the shared and terminal modal tokens wired to their intended surfaces", () => {
		expect(readCssVariable(SHARED_THEME_CSS, ":root", "--bg-modal")).toBe("#ffffff");
		expect(readCssVariable(SHARED_THEME_CSS, ".dark", "--bg-modal")).toBe("#292b33");
		expect(readCssVariable(SHARED_THEME_CSS, "@theme inline", "--color-modal")).toBe("var(--bg-modal)");

		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--bg-modal")).toBe("#ffffff");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--bg-modal")).toBe("#0f1a1f");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--bg-overlay")).toBe("#292b33");
		expect(readCssVariable(TERMINAL_THEME_CSS, "@theme inline", "--color-modal")).toBe("var(--bg-modal)");
	});

	it("keeps market-close light colors exact and dark controls contrast-safe", () => {
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--market-close-text-strong")).toBe("#1a2330");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--market-close-control-active")).toBe("#1a2330");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--market-close-danger")).toBe("#d6453d");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--market-close-danger-disabled")).toBe("#efc3bf");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--market-close-warning")).toBe("#d98e1f");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--market-close-control-active")).toBe("var(--fill-selected)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--market-close-control-active-text")).toBe(
			"var(--text-inverse-strong)",
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

	it("keeps the language settings surface exact in light mode and theme-aware in dark mode", () => {
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--language-settings-disabled")).toBe("#c6cfd9");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--language-settings-divider")).toBe("#eef1f5");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--language-settings-shadow")).toBe(
			"0 16px 40px rgba(20, 30, 45, 0.18)",
		);
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--language-settings-disabled")).toBe("var(--text-disabled)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--language-settings-divider")).toBe("var(--stroke-weak)");
		expect(readCssVariable(TERMINAL_THEME_CSS, "@theme inline", "--shadow-language-settings")).toBe(
			"var(--language-settings-shadow)",
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
