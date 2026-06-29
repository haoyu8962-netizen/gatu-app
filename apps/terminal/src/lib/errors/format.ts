import { t } from "@lingui/core/macro";

const ERROR_MESSAGE_TRUNCATE_LIMIT = 100;

const ERROR_PATTERNS = [
	{ pattern: /user rejected/i, message: () => t`Transaction was rejected` },
	{ pattern: /wallet connection request was rejected/i, message: () => t`Wallet connection request was rejected.` },
	{
		pattern: /wallet connection failed|failed to connect|restore.*session|unlock your wallet/i,
		message: () => t`Wallet connection failed. Unlock your wallet, approve the connection, then retry.`,
	},
	{ pattern: /arbitrum network switch was rejected/i, message: () => t`Arbitrum network switch was rejected.` },
	{
		pattern: /unable to switch wallet to arbitrum|wallet is not connected to arbitrum/i,
		message: () => t`Unable to switch wallet to Arbitrum. Switch networks in your wallet and retry.`,
	},
	{ pattern: /insufficient funds/i, message: () => t`Insufficient funds for gas` },
	{ pattern: /must deposit before performing actions/i, message: () => t`No balance on Hyperliquid. Deposit first.` },
	{
		pattern: /selected wallet does not match/i,
		message: () => t`Selected wallet does not match the connected account. Reconnect your wallet and try again.`,
	},
	{
		pattern: /wallet did not return a transaction hash/i,
		message: () =>
			t`Wallet did not return a transaction hash. Check your wallet activity before retrying to avoid sending the deposit twice.`,
	},
	{
		pattern: /wallet returned a transaction hash.*not visible on arbitrum/i,
		message: () =>
			t`Wallet returned a transaction hash, but it is not visible on Arbitrum yet. Check your wallet activity or Arbiscan before retrying to avoid sending the deposit twice.`,
	},
	{ pattern: /not broadcast/i, message: () => t`Transaction was not broadcast. Please retry.` },
	{
		pattern: /deposit transaction was broadcast but confirmation timed out/i,
		message: () => t`Deposit transaction was broadcast but confirmation timed out. Check Arbiscan before retrying.`,
	},
	{
		pattern: /wallet nonce may be out of sync/i,
		message: () =>
			t`Deposit transaction was submitted but did not confirm on Arbitrum. Your wallet nonce may be out of sync with the network. Clear pending activity or reset nonce data in your wallet, then retry.`,
	},
] as const;

export function formatTransferError(error: Error | null): string {
	if (!error) return t`Unknown error`;

	const message = error.message;

	for (const { pattern, message: getMessage } of ERROR_PATTERNS) {
		if (pattern.test(message)) {
			return getMessage();
		}
	}

	const firstLine = message.split("\n")[0];
	return firstLine.length > ERROR_MESSAGE_TRUNCATE_LIMIT
		? `${firstLine.slice(0, ERROR_MESSAGE_TRUNCATE_LIMIT)}...`
		: firstLine;
}
