import type { AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";
import type { PrivySignTypedData } from "./privy-agent-signer";
import { hasSameWalletAddress } from "./privy-wagmi";

interface CreatePrivyOwnerSignerOptions {
	ownerAddress: `0x${string}`;
	chainId: number;
	signTypedData: PrivySignTypedData;
	assertCurrent: () => void;
}

export function createPrivyOwnerSigner({
	ownerAddress,
	chainId,
	signTypedData,
	assertCurrent,
}: CreatePrivyOwnerSignerOptions): AbstractViemJsonRpcAccount {
	if (!hasSameWalletAddress(ownerAddress, ownerAddress)) {
		throw new Error("A valid embedded owner wallet is required.");
	}
	if (!Number.isSafeInteger(chainId) || chainId <= 0) {
		throw new Error("A valid owner-signing chain is required.");
	}

	return {
		async signTypedData(typedData) {
			assertCurrent();
			const result = await signTypedData(
				{
					...typedData,
					types: Object.fromEntries(Object.entries(typedData.types).map(([name, fields]) => [name, [...fields]])),
				},
				{
					address: ownerAddress,
					uiOptions: { showWalletUIs: false },
				},
			);
			assertCurrent();
			return result.signature as `0x${string}`;
		},
		async getAddresses() {
			assertCurrent();
			return [ownerAddress];
		},
		async getChainId() {
			assertCurrent();
			return chainId;
		},
	};
}
