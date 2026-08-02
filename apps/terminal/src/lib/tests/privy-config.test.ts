import { describe, expect, it } from "vitest";
import { PRIVY_WALLET_LIST, privyConfig } from "@/config/privy";

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

	it("keeps desktop-only QR and misleading wallet aliases out of the mobile catalog", () => {
		expect(PRIVY_WALLET_LIST).not.toContain("wallet_connect_qr");
		expect(PRIVY_WALLET_LIST).not.toContain("safe");
	});
});
