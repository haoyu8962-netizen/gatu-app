import { ExchangeClient, type IRequestTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { toHyperliquidWallet, walletClientMatchesAddress } from "../../../../../packages/hl-react/src/wallet";

const OWNER_ACCOUNT = privateKeyToAccount(`0x${"0".repeat(63)}1`);
const OTHER_ACCOUNT = privateKeyToAccount(`0x${"0".repeat(63)}2`);
const ACCOUNT_ADDRESS = OWNER_ACCOUNT.address.toLowerCase() as `0x${string}`;
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222" as const;
type TypedData = Parameters<typeof OWNER_ACCOUNT.signTypedData>[0];
type Sign = (typedData: TypedData) => Promise<`0x${string}`>;

const WITHDRAW_TYPED_DATA = {
	domain: {
		name: "HyperliquidSignTransaction",
		version: "1",
		chainId: 42161,
		verifyingContract: "0x0000000000000000000000000000000000000000",
	},
	types: {
		EIP712Domain: [
			{ name: "name", type: "string" },
			{ name: "version", type: "string" },
			{ name: "chainId", type: "uint256" },
			{ name: "verifyingContract", type: "address" },
		],
		"HyperliquidTransaction:Withdraw": [
			{ name: "hyperliquidChain", type: "string" },
			{ name: "destination", type: "string" },
			{ name: "amount", type: "string" },
			{ name: "time", type: "uint64" },
		],
	},
	primaryType: "HyperliquidTransaction:Withdraw",
	message: { hyperliquidChain: "Mainnet", destination: OTHER_ADDRESS, amount: "1", time: 1_722_000_000_000 },
} as unknown as TypedData;

const signAsOwner: Sign = (typedData) => OWNER_ACCOUNT.signTypedData(typedData);
const MISMATCHED_SIGNERS: Array<[string, Sign]> = [
	["another account of the same wallet", (typedData) => OTHER_ACCOUNT.signTypedData(typedData)],
	["an unrecoverable signature", async () => `0x${"11".repeat(64)}1b`],
	["a contract-wallet signature", async () => `0x${"ab".repeat(130)}`],
];

function createWalletClient(sign: Sign = signAsOwner, address: `0x${string}` = ACCOUNT_ADDRESS) {
	return {
		account: { address },
		getAddresses: vi.fn().mockResolvedValue([address]),
		getChainId: vi.fn().mockResolvedValue(42161),
		signTypedData: vi.fn(sign),
	};
}

function createLocalLikeClient(sign: Sign = signAsOwner) {
	return { account: { address: ACCOUNT_ADDRESS }, signTypedData: vi.fn(sign) };
}

type TypedDataWallet = { signTypedData: (params: unknown) => Promise<`0x${string}`> };

function createSdkClient(walletClient: unknown) {
	const wallet = toHyperliquidWallet(walletClient, ACCOUNT_ADDRESS);
	if (!wallet) throw new Error("Missing wallet");
	const request = vi.fn().mockResolvedValue({ status: "ok", response: { type: "default" } });
	const client = new ExchangeClient({
		transport: { isTestnet: false, request } as IRequestTransport,
		wallet,
		nonceManager: () => 1_722_000_000_000,
	});
	return { client, request };
}

describe("Hyperliquid wallet adapter", () => {
	it("matches the active wallet account case-insensitively", () => {
		const client = createWalletClient();

		expect(walletClientMatchesAddress(client, ACCOUNT_ADDRESS.toUpperCase())).toBe(true);
	});

	it("rejects an expected address that differs from the active signer", () => {
		const client = createWalletClient();

		expect(toHyperliquidWallet(client, OTHER_ADDRESS)).toBeNull();
		expect(client.signTypedData).not.toHaveBeenCalled();
	});

	it("uses the active account when the expected address matches and returns its signature", async () => {
		const client = createWalletClient();
		const wallet = toHyperliquidWallet(client, ACCOUNT_ADDRESS) as unknown as TypedDataWallet;

		const signature = await wallet.signTypedData(WITHDRAW_TYPED_DATA);

		expect(client.signTypedData).toHaveBeenCalledWith(expect.objectContaining({ account: ACCOUNT_ADDRESS }));
		expect(signature).toBe(await OWNER_ACCOUNT.signTypedData(WITHDRAW_TYPED_DATA));
	});

	it("submits a user-signed action whose signature recovers to the selected owner", async () => {
		const walletClient = createWalletClient();
		const { client, request } = createSdkClient(walletClient);

		await client.withdraw3({ destination: OTHER_ADDRESS, amount: "1" });

		expect(walletClient.signTypedData).toHaveBeenCalledOnce();
		expect(request).toHaveBeenCalledOnce();
	});

	it.each(MISMATCHED_SIGNERS)("never sends a user-signed action signed by %s", async (_label, sign) => {
		const walletClient = createWalletClient(sign);
		const { client, request } = createSdkClient(walletClient);

		await expect(client.withdraw3({ destination: OTHER_ADDRESS, amount: "1" })).rejects.toMatchObject({
			cause: expect.objectContaining({ name: "WalletAccountMismatchError" }),
		});
		expect(walletClient.signTypedData).toHaveBeenCalledOnce();
		expect(request).not.toHaveBeenCalled();
	});

	it("checks the recovered signer for a wallet client exposing only its account", async () => {
		const ownerWallet = toHyperliquidWallet(createLocalLikeClient(), ACCOUNT_ADDRESS) as unknown as TypedDataWallet;
		const otherWallet = toHyperliquidWallet(
			createLocalLikeClient((typedData) => OTHER_ACCOUNT.signTypedData(typedData)),
			ACCOUNT_ADDRESS,
		) as unknown as TypedDataWallet;

		await expect(ownerWallet.signTypedData(WITHDRAW_TYPED_DATA)).resolves.toBe(
			await OWNER_ACCOUNT.signTypedData(WITHDRAW_TYPED_DATA),
		);
		await expect(otherWallet.signTypedData(WITHDRAW_TYPED_DATA)).rejects.toMatchObject({
			name: "WalletAccountMismatchError",
		});
	});
});
