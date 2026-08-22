import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export interface ApiWalletCredential {
	address: Address;
	privateKey: Hex;
}

export interface ApiWalletCredentialDownload {
	accountAddress: string;
	agentAddress: Address;
	agentName: string;
	privateKey: Hex;
}

export function createApiWalletCredential(): ApiWalletCredential {
	const privateKey = generatePrivateKey();
	return {
		address: privateKeyToAccount(privateKey).address,
		privateKey,
	};
}

export function downloadApiWalletCredential(credential: ApiWalletCredentialDownload): void {
	const payload = JSON.stringify(
		{
			accountAddress: credential.accountAddress,
			agentAddress: credential.agentAddress,
			agentName: credential.agentName,
			privateKey: credential.privateKey,
			warning: "Store this file securely. Anyone with this private key can act as this API wallet.",
		},
		null,
		2,
	);
	const blobUrl = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
	const anchor = document.createElement("a");
	anchor.download = `hyperliquid-api-wallet-${credential.agentName}.json`;
	anchor.href = blobUrl;
	document.body.append(anchor);
	let downloadTriggered = false;
	try {
		anchor.click();
		downloadTriggered = true;
	} finally {
		anchor.remove();
		if (downloadTriggered) window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
		else URL.revokeObjectURL(blobUrl);
	}
}
