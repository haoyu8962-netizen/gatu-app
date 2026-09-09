import { ExchangeClient, type IRequestTransport } from "@nktkas/hyperliquid";
import type { AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";
import { describe, expect, it, vi } from "vitest";
import { createPrivyOwnerSigner } from "@/lib/wallet/privy-owner-signer";

const OWNER = "0x1111111111111111111111111111111111111111";
const BUILDER = "0x2222222222222222222222222222222222222222";
const SIGNATURE = `0x${"11".repeat(64)}1b` as const;
const typedData: Parameters<AbstractViemJsonRpcAccount["signTypedData"]>[0] = {
	domain: {
		name: "Exchange",
		version: "1",
		chainId: 1337,
		verifyingContract: "0x0000000000000000000000000000000000000000",
	},
	types: {
		Agent: [
			{ name: "source", type: "string" },
			{ name: "connectionId", type: "bytes32" },
		],
	},
	primaryType: "Agent",
	message: { source: "a", connectionId: `0x${"00".repeat(32)}` },
};

describe("createPrivyOwnerSigner", () => {
	it("uses the exact owner for SDK L1 actions and builder approval without a duplicate confirmation", async () => {
		const signTypedData = vi.fn().mockResolvedValue({ signature: SIGNATURE });
		const assertCurrent = vi.fn();
		const wallet = createPrivyOwnerSigner({ ownerAddress: OWNER, chainId: 42161, signTypedData, assertCurrent });
		const request = vi.fn().mockResolvedValue({ status: "ok", response: { type: "default" } });
		const client = new ExchangeClient({
			wallet,
			transport: { isTestnet: false, request } as IRequestTransport,
		});

		await client.order({
			orders: [{ a: 0, b: true, p: "10", s: "1", r: false, t: { limit: { tif: "Gtc" } } }],
			grouping: "na",
		});
		await client.cancel({ cancels: [{ a: 0, o: 1 }] });
		await client.updateLeverage({ asset: 0, isCross: true, leverage: 5 });
		await client.approveBuilderFee({ builder: BUILDER, maxFeeRate: "0.01%" });

		expect(await wallet.getAddresses()).toEqual([OWNER]);
		expect(signTypedData).toHaveBeenCalledTimes(4);
		for (const [payload, options] of signTypedData.mock.calls.slice(0, 3)) {
			expect(payload).toEqual(
				expect.objectContaining({
					domain: expect.objectContaining({ name: "Exchange", chainId: 1337 }),
					primaryType: "Agent",
				}),
			);
			expect(options).toEqual({ address: OWNER, uiOptions: { showWalletUIs: false } });
		}
		expect(signTypedData.mock.calls[3]).toEqual([
			expect.objectContaining({
				domain: expect.objectContaining({ name: "HyperliquidSignTransaction", chainId: 42161 }),
				primaryType: "HyperliquidTransaction:ApproveBuilderFee",
				message: expect.objectContaining({ hyperliquidChain: "Mainnet", builder: BUILDER }),
			}),
			{ address: OWNER, uiOptions: { showWalletUIs: false } },
		]);
		expect(request.mock.calls.map(([, body]) => body.action.type)).toEqual([
			"order",
			"cancel",
			"updateLeverage",
			"approveBuilderFee",
		]);
		expect(assertCurrent).toHaveBeenCalled();
	});

	it("rejects an invalidated session before requesting a signature or exposing the owner", async () => {
		const signTypedData = vi.fn();
		const wallet = createPrivyOwnerSigner({
			ownerAddress: OWNER,
			chainId: 42161,
			signTypedData,
			assertCurrent() {
				throw new Error("session changed");
			},
		});

		await expect(wallet.signTypedData(typedData)).rejects.toThrow("session changed");
		await expect(wallet.getAddresses()).rejects.toThrow("session changed");
		await expect(wallet.getChainId()).rejects.toThrow("session changed");
		expect(signTypedData).not.toHaveBeenCalled();
	});

	it("prevents SDK submission when the owner session expires while Privy is signing", async () => {
		let releaseSignature = (_value: { signature: string }) => {};
		const deferred = new Promise<{ signature: string }>((resolve) => {
			releaseSignature = resolve;
		});
		const signTypedData = vi.fn().mockReturnValue(deferred);
		let active = true;
		const wallet = createPrivyOwnerSigner({
			ownerAddress: OWNER,
			chainId: 42161,
			signTypedData,
			assertCurrent() {
				if (!active) throw new Error("session changed");
			},
		});
		const request = vi.fn();
		const client = new ExchangeClient({ wallet, transport: { isTestnet: false, request } as IRequestTransport });
		const cancel = client.cancel({ cancels: [{ a: 0, o: 1 }] });
		await vi.waitFor(() => expect(signTypedData).toHaveBeenCalledOnce());
		active = false;
		releaseSignature({ signature: SIGNATURE });

		await expect(cancel).rejects.toMatchObject({ cause: expect.objectContaining({ message: "session changed" }) });
		expect(request).not.toHaveBeenCalled();
	});

	it("propagates signing rejection without submitting or trying another wallet", async () => {
		const signTypedData = vi.fn().mockRejectedValue(new Error("user rejected"));
		const wallet = createPrivyOwnerSigner({
			ownerAddress: OWNER,
			chainId: 42161,
			signTypedData,
			assertCurrent: vi.fn(),
		});
		const request = vi.fn();
		const client = new ExchangeClient({ wallet, transport: { isTestnet: true, request } as IRequestTransport });

		await expect(client.cancel({ cancels: [{ a: 0, o: 1 }] })).rejects.toMatchObject({
			cause: expect.objectContaining({ message: "user rejected" }),
		});
		expect(signTypedData).toHaveBeenCalledOnce();
		expect(request).not.toHaveBeenCalled();
	});

	it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid user-signing chain %s", (chainId) => {
		expect(() =>
			createPrivyOwnerSigner({ ownerAddress: OWNER, chainId, signTypedData: vi.fn(), assertCurrent: vi.fn() }),
		).toThrow("valid owner-signing chain");
	});

	it.each(["0x0000000000000000000000000000000000000000", "0x1234"] as const)(
		"rejects invalid owner %s",
		(ownerAddress) => {
			expect(() =>
				createPrivyOwnerSigner({ ownerAddress, chainId: 42161, signTypedData: vi.fn(), assertCurrent: vi.fn() }),
			).toThrow("valid embedded owner wallet");
		},
	);
});
