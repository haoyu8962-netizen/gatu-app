import { beforeEach, describe, expect, it, vi } from "vitest";

const SOURCE_ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";

const wagmiState = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111" as `0x${string}`,
	clientAddress: "0x1111111111111111111111111111111111111111" as `0x${string}`,
	clientChainId: 42161,
	getConnectorClient: vi.fn(),
	switchChain: vi.fn(),
}));
const sdkState = vi.hoisted(() => ({
	createConfig: vi.fn(),
	evmOptions: null as null | {
		getWalletClient: (chainId?: number) => Promise<unknown>;
		switchChain: (chainId: number) => Promise<unknown>;
	},
}));

vi.mock("@wagmi/core", () => ({
	getAccount: () => ({
		address: wagmiState.address,
		isConnected: true,
	}),
	getConnectorClient: wagmiState.getConnectorClient,
	switchChain: wagmiState.switchChain,
}));
vi.mock("@lifi/sdk", () => ({
	createConfig: sdkState.createConfig,
	EVM: (options: {
		getWalletClient: (chainId?: number) => Promise<unknown>;
		switchChain: (chainId: number) => Promise<unknown>;
	}) => {
		sdkState.evmOptions = options;
		return { type: "EVM" };
	},
}));
vi.mock("@/config/wagmi", () => ({ config: {} }));

import { getActiveLiFiWalletAddress, initLiFi, runWithLiFiExecutionWallet } from "@/lib/lifi/config";

describe("LI.FI execution wallet binding", () => {
	beforeEach(() => {
		wagmiState.address = SOURCE_ADDRESS;
		wagmiState.clientAddress = SOURCE_ADDRESS;
		wagmiState.clientChainId = 42161;
		wagmiState.getConnectorClient.mockReset();
		wagmiState.getConnectorClient.mockImplementation(async () => ({
			account: { address: wagmiState.clientAddress },
			chain: { id: wagmiState.clientChainId },
		}));
		wagmiState.switchChain.mockReset();
		wagmiState.switchChain.mockImplementation(async (_config, { chainId }: { chainId: number }) => {
			wagmiState.clientChainId = chainId;
		});
	});

	it("reads the actual wagmi signer and enforces it again inside the SDK provider", async () => {
		initLiFi();
		expect(getActiveLiFiWalletAddress()).toBe(SOURCE_ADDRESS);
		if (!sdkState.evmOptions) throw new Error("LI.FI EVM provider was not initialized");

		wagmiState.address = OTHER_ADDRESS;
		await expect(
			runWithLiFiExecutionWallet(
				SOURCE_ADDRESS,
				42161,
				() => sdkState.evmOptions?.getWalletClient(42161) as Promise<unknown>,
			),
		).rejects.toThrow("active wallet does not match");
		expect(wagmiState.getConnectorClient).not.toHaveBeenCalled();

		wagmiState.address = SOURCE_ADDRESS;
		await expect(
			runWithLiFiExecutionWallet(
				SOURCE_ADDRESS,
				42161,
				() => sdkState.evmOptions?.getWalletClient(42161) as Promise<unknown>,
			),
		).resolves.toBeDefined();
		expect(wagmiState.getConnectorClient).toHaveBeenCalledOnce();
	});

	it("rejects a requested or returned client chain outside the bound source chain", async () => {
		initLiFi();
		if (!sdkState.evmOptions) throw new Error("LI.FI EVM provider was not initialized");

		await expect(
			runWithLiFiExecutionWallet(
				SOURCE_ADDRESS,
				42161,
				() => sdkState.evmOptions?.getWalletClient(1) as Promise<unknown>,
			),
		).rejects.toThrow("requested a network that does not match this bridge route");
		expect(wagmiState.getConnectorClient).not.toHaveBeenCalled();

		wagmiState.clientChainId = 1;
		await expect(
			runWithLiFiExecutionWallet(
				SOURCE_ADDRESS,
				42161,
				() => sdkState.evmOptions?.getWalletClient() as Promise<unknown>,
			),
		).rejects.toThrow("wallet network does not match this bridge route");

		wagmiState.clientChainId = 42161;
		wagmiState.clientAddress = OTHER_ADDRESS;
		await expect(
			runWithLiFiExecutionWallet(
				SOURCE_ADDRESS,
				42161,
				() => sdkState.evmOptions?.getWalletClient() as Promise<unknown>,
			),
		).rejects.toThrow("active wallet does not match this bridge route");
	});

	it("only switches to the bound source chain and verifies the resulting client", async () => {
		initLiFi();
		if (!sdkState.evmOptions) throw new Error("LI.FI EVM provider was not initialized");

		await expect(
			runWithLiFiExecutionWallet(SOURCE_ADDRESS, 42161, () => sdkState.evmOptions?.switchChain(1) as Promise<unknown>),
		).rejects.toThrow("requested a network that does not match this bridge route");
		expect(wagmiState.switchChain).not.toHaveBeenCalled();

		wagmiState.address = OTHER_ADDRESS;
		await expect(
			runWithLiFiExecutionWallet(
				SOURCE_ADDRESS,
				42161,
				() => sdkState.evmOptions?.switchChain(42161) as Promise<unknown>,
			),
		).rejects.toThrow("active wallet does not match");
		expect(wagmiState.switchChain).not.toHaveBeenCalled();

		wagmiState.address = SOURCE_ADDRESS;
		wagmiState.clientChainId = 1;
		await expect(
			runWithLiFiExecutionWallet(
				SOURCE_ADDRESS,
				42161,
				() => sdkState.evmOptions?.switchChain(42161) as Promise<unknown>,
			),
		).resolves.toBeDefined();
		expect(wagmiState.switchChain).toHaveBeenCalledOnce();
		expect(wagmiState.getConnectorClient).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ chainId: 42161 }),
		);
	});
});
