import { describe, expect, it } from "vitest";
import { arbitrum, mainnet } from "wagmi/chains";
import { getBridgeRpcUrl } from "@/config/wagmi";

describe("wagmi config", () => {
	it("uses a browser-safe Ethereum RPC by default", () => {
		expect(getBridgeRpcUrl(mainnet, {})).toBe("https://ethereum-rpc.publicnode.com");
	});

	it("allows overriding the Ethereum RPC URL", () => {
		expect(getBridgeRpcUrl(mainnet, { VITE_ETHEREUM_RPC_URL: "http://localhost:8545" })).toBe("http://localhost:8545");
	});

	it("leaves non-overridden bridge chains on their chain defaults", () => {
		expect(getBridgeRpcUrl(arbitrum, {})).toBeUndefined();
	});
});
