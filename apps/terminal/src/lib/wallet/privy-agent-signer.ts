import type { SignTypedDataParams } from "@privy-io/react-auth";
import type { AgentApprovalOptions } from "@/lib/hyperliquid";
import { assertTypedDataSignedBy } from "./external-agent-signer";
import { hasSameWalletAddress } from "./privy-wagmi";

interface PrivySignTypedDataOptions {
	address?: string;
	uiOptions?: {
		showWalletUIs?: boolean;
		title?: string;
		description?: string;
		buttonText?: string;
		isCancellable?: boolean;
	};
}

export type PrivySignTypedData = (
	input: SignTypedDataParams,
	options?: PrivySignTypedDataOptions,
) => Promise<{ signature: string }>;

/** Translated text for Privy's own confirmation, shown only when the application did not review the approval. */
export interface PrivyApprovalReviewCopy {
	title: string;
	description: string;
	buttonText: string;
}

interface CreatePrivyAgentSignerOptions extends AgentApprovalOptions {
	expectedAddress: `0x${string}`;
	activeAddress: `0x${string}` | undefined;
	embeddedWalletAddress: `0x${string}` | undefined;
	chainId: number;
	signTypedData: PrivySignTypedData;
	beforeSubmit: () => void | Promise<void>;
	reviewCopy: PrivyApprovalReviewCopy;
}

interface HyperliquidTypedData {
	domain: {
		name: string;
		version: string;
		chainId: number;
		verifyingContract: `0x${string}`;
	};
	types: Record<string, readonly { name: string; type: string }[]>;
	primaryType: string;
	message: Record<string, unknown>;
}

/**
 * Creates the narrow wallet adapter used only for explicit Hyperliquid Agent
 * approval and revocation. It fails closed unless the selected master account,
 * active wallet, and Privy embedded wallet are the same address.
 */
export function createPrivyAgentSigner({
	applicationReview,
	expectedAddress,
	activeAddress,
	embeddedWalletAddress,
	chainId,
	signTypedData,
	beforeSubmit,
	reviewCopy,
}: CreatePrivyAgentSignerOptions) {
	if (
		!hasSameWalletAddress(expectedAddress, activeAddress) ||
		!hasSameWalletAddress(expectedAddress, embeddedWalletAddress)
	) {
		throw new Error("The active embedded wallet does not match the selected Hyperliquid account.");
	}
	if (!Number.isSafeInteger(chainId) || chainId <= 0) {
		throw new Error("A valid approval chain is required.");
	}

	return {
		async signTypedData(typedData: HyperliquidTypedData): Promise<`0x${string}`> {
			const result = await signTypedData(typedData as SignTypedDataParams, {
				address: expectedAddress,
				uiOptions:
					applicationReview === "confirmed"
						? { showWalletUIs: false }
						: {
								showWalletUIs: true,
								...reviewCopy,
								isCancellable: true,
							},
			});
			const signature = result.signature as `0x${string}`;
			await assertTypedDataSignedBy(typedData, signature, expectedAddress);
			await beforeSubmit();
			return signature;
		},
		async getAddresses(): Promise<`0x${string}`[]> {
			return [expectedAddress];
		},
		async getChainId(): Promise<number> {
			return chainId;
		},
	};
}
