import { describe, expect, it } from "vitest";
import { getExplorerAddressUrl, getExplorerTokenUrl, getExplorerTxUrl } from "@/lib/hyperliquid";

describe("Hyperliquid explorer links", () => {
	it("open each network's own explorer, as the official apps host it", () => {
		expect(getExplorerTxUrl("0xabc", false)).toBe("https://app.hyperliquid.xyz/explorer/tx/0xabc");
		expect(getExplorerTxUrl("0xabc", true)).toBe("https://app.hyperliquid-testnet.xyz/explorer/tx/0xabc");
		expect(getExplorerTokenUrl("0x11", false)).toBe("https://app.hyperliquid.xyz/explorer/token/0x11");
		expect(getExplorerTokenUrl("0x11", true)).toBe("https://app.hyperliquid-testnet.xyz/explorer/token/0x11");
		expect(getExplorerAddressUrl("0x22", false)).toBe("https://app.hyperliquid.xyz/explorer/address/0x22");
		expect(getExplorerAddressUrl("0x22", true)).toBe("https://app.hyperliquid-testnet.xyz/explorer/address/0x22");
	});
});
