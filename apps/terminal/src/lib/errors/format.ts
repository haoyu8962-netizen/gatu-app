import { t } from "@lingui/core/macro";

const ERROR_MESSAGE_TRUNCATE_LIMIT = 100;

const ERROR_PATTERNS = [
	{ pattern: /user rejected/i, message: () => t`Transaction was rejected` },
	{ pattern: /insufficient funds/i, message: () => t`Insufficient funds for gas` },
	{ pattern: /must deposit before performing actions/i, message: () => t`No balance on Hyperliquid. Deposit first.` },
	{
		pattern: /selected wallet does not match/i,
		message: () => t`Selected wallet does not match the connected account. Reconnect your wallet and try again.`,
	},
	{ pattern: /not broadcast/i, message: () => t`Transaction was not broadcast. Please retry.` },
	{
		pattern: /confirmation timed out|timed out|timeout/i,
		message: () => t`Deposit transaction was broadcast but confirmation timed out. Check Arbiscan before retrying.`,
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
