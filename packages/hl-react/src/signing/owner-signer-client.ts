import type { ExchangeClient, IRequestTransport } from "@nktkas/hyperliquid";
import type { AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";
import { createExchangeClient, getHttpTransport } from "../clients";
import { ExchangeRequestInvalidatedError } from "../internal/exchange/request-scheduler";
import type { HyperliquidOwnerSigner } from "./owner-signer-provider";

const ownerClients = new WeakMap<HyperliquidOwnerSigner, Map<boolean, ExchangeClient>>();

export function getOwnerSignerClient(owner: HyperliquidOwnerSigner, isTestnet: boolean): ExchangeClient | null {
	const cached = ownerClients.get(owner)?.get(isTestnet);
	if (cached) return cached;
	const client = createOwnerSignerClient(owner, isTestnet);
	if (!client) return null;
	const clients = ownerClients.get(owner) ?? new Map<boolean, ExchangeClient>();
	clients.set(isTestnet, client);
	ownerClients.set(owner, clients);
	return client;
}

export function createOwnerSignerClient(
	owner: HyperliquidOwnerSigner,
	isTestnet: boolean,
	baseTransport = getHttpTransport(isTestnet),
) {
	const wallet = owner.wallet;
	const address = owner.ownerAddress;
	if (!wallet || !address) return null;
	const signingWallet = wallet;
	const signingAddress = address;

	async function verifyOwner() {
		owner.assertCurrent();
		const addresses = await signingWallet.getAddresses();
		owner.assertCurrent();
		if (addresses.length !== 1 || addresses[0]?.toLowerCase() !== signingAddress.toLowerCase()) {
			throw new ExchangeRequestInvalidatedError();
		}
	}

	const guardedWallet: AbstractViemJsonRpcAccount = {
		async getAddresses() {
			await verifyOwner();
			return [address];
		},
		async getChainId() {
			await verifyOwner();
			const chainId = await wallet.getChainId();
			owner.assertCurrent();
			return chainId;
		},
		async signTypedData(typedData) {
			await verifyOwner();
			const signature = await wallet.signTypedData(typedData);
			await verifyOwner();
			return signature;
		},
	};
	const transport: IRequestTransport = {
		isTestnet: baseTransport.isTestnet,
		async request<T>(endpoint: "info" | "exchange", payload: unknown, signal?: AbortSignal): Promise<T> {
			await verifyOwner();
			owner.assertCurrent();
			return baseTransport.request<T>(endpoint, payload, signal);
		},
	};
	return createExchangeClient(guardedWallet, isTestnet, undefined, transport);
}
