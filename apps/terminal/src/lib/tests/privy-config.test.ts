import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRIVY_CONFIG_BY_THEME, PRIVY_WALLET_LIST, privyConfig } from "@/config/privy";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_STYLES = readFileSync(resolve(TEST_DIR, "../..", "styles.css"), "utf8");

describe("Privy wallet catalog", () => {
	it("prioritizes supported mobile wallets before detected and WalletConnect entries", () => {
		expect(PRIVY_WALLET_LIST).toEqual([
			"binance",
			"metamask",
			"okx_wallet",
			"bitget_wallet",
			"uniswap",
			"coinbase_wallet",
			"detected_ethereum_wallets",
			"wallet_connect",
		]);
		expect(privyConfig.appearance?.walletList).toEqual(PRIVY_WALLET_LIST);
		expect(privyConfig.appearance?.walletChainType).toBe("ethereum-only");
	});

	it("matches the managed wallet UI to each terminal theme without changing its catalog", () => {
		expect(PRIVY_CONFIG_BY_THEME.dark.appearance).toMatchObject({
			theme: "#0F1A1F",
			accentColor: "#EDEEF2",
		});
		expect(PRIVY_CONFIG_BY_THEME.light.appearance).toMatchObject({
			theme: "#FFFFFF",
			accentColor: "#15171E",
		});

		for (const config of Object.values(PRIVY_CONFIG_BY_THEME)) {
			expect(config.loginMethods).toEqual(["wallet", "email"]);
			expect(config.globalDisablePasskeys).toBe(true);
			expect(config.embeddedWallets).toEqual({
				ethereum: { createOnLogin: "users-without-wallets" },
				showWalletUIs: false,
			});
			expect(config.appearance?.walletList).toEqual(PRIVY_WALLET_LIST);
			expect(config.appearance?.walletChainType).toBe("ethereum-only");
		}
		expect(PRIVY_CONFIG_BY_THEME.light.defaultChain?.id).toBe(PRIVY_CONFIG_BY_THEME.dark.defaultChain?.id);
		expect(PRIVY_CONFIG_BY_THEME.light.supportedChains?.map(({ id }) => id)).toEqual(
			PRIVY_CONFIG_BY_THEME.dark.supportedChains?.map(({ id }) => id),
		);
	});

	it("uses only Privy's documented radius variables for the managed UI", () => {
		expect(readCssVariable(TERMINAL_STYLES, "body", "--privy-border-radius-sm")).toBe("var(--radius-16)");
		expect(readCssVariable(TERMINAL_STYLES, "body", "--privy-border-radius-md")).toBe("var(--radius-16)");
		expect(readCssVariable(TERMINAL_STYLES, "body", "--privy-border-radius-lg")).toBe("var(--radius-32)");
		expect(readCssVariable(TERMINAL_STYLES, "body", "--privy-border-radius-full")).toBe("var(--radius-full)");
		expect(TERMINAL_STYLES).not.toContain("--privy-border-radius-xs");
		expect(TERMINAL_STYLES).not.toContain("--privy-border-radius-mdlg");
	});

	it("keeps desktop-only QR and misleading wallet aliases out of the mobile catalog", () => {
		expect(PRIVY_WALLET_LIST).not.toContain("wallet_connect_qr");
		expect(PRIVY_WALLET_LIST).not.toContain("safe");
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
