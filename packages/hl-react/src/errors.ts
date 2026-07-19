export class ProviderNotFoundError extends Error {
	constructor() {
		super("HyperliquidProvider is missing in the React tree");
		this.name = "ProviderNotFoundError";
	}
}

export class MissingTransportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MissingTransportError";
	}
}

export class MissingWalletError extends Error {
	constructor() {
		super("Wallet is required for exchange actions");
		this.name = "MissingWalletError";
	}
}

export class WalletAccountMismatchError extends Error {
	constructor() {
		super("Selected wallet does not match the connected account. Reconnect your wallet and try again.");
		this.name = "WalletAccountMismatchError";
	}
}

export function assertExchange<T>(exchange: T | null): asserts exchange is T {
	if (!exchange) throw new MissingWalletError();
}
