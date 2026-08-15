import { t } from "@lingui/core/macro";
import { SCALE_LEVELS_MAX, SCALE_LEVELS_MIN } from "@/config/trade";

const ERROR_MESSAGE_TRUNCATE_LIMIT = 100;
const SMART_WALLET_NONCE_CONFLICT_PATTERN = /\bAA25\b(?: invalid account nonce)?/i;

const ERROR_PATTERNS = [
	{
		pattern: /referral request was submitted but its final status could not be confirmed/i,
		message: () =>
			t`The request was submitted, but its final status is still updating. Check referral data and claim history before retrying.`,
	},
	{
		pattern: /wallet or network changed before the referral request could be confirmed/i,
		message: () =>
			t`Wallet or network changed before the referral request could be confirmed. Reopen the action and review the current account.`,
	},
	{
		pattern: /referral codes must be between 1 and 20 characters/i,
		message: () => t`Referral codes must be between 1 and 20 characters.`,
	},
	{
		pattern: /this account already has a referral code/i,
		message: () => t`This account already has a referral code and cannot apply another one.`,
	},
	{
		pattern: /referral codes cannot be applied after cumulative volume exceeds \$10,000/i,
		message: () => t`Referral codes cannot be applied after cumulative volume exceeds $10,000.`,
	},
	{
		pattern: /not currently eligible to create a referral code/i,
		message: () => t`Hyperliquid does not currently show this account as eligible to create a referral code.`,
	},
	{
		pattern: /there are no eligible rewards available to claim/i,
		message: () => t`There are no eligible rewards available to claim.`,
	},
	{
		pattern: /referral access could not be verified for this account/i,
		message: () => t`Referral access could not be verified for this account. Refresh access status before retrying.`,
	},
	{
		pattern: /connect the selected owner wallet before continuing/i,
		message: () => t`Wallet connection failed. Unlock your wallet, approve the connection, then retry.`,
	},
	{
		pattern: /the active wallet does not match this hyperliquid account/i,
		message: () => t`Selected wallet does not match the connected account. Reconnect your wallet and try again.`,
	},
	{
		pattern: /another funds operation is still in progress/i,
		message: () => t`Another funds operation is still in progress for this account. Try again after it finishes.`,
	},
	{
		pattern: /secure cross-tab funds coordination requires web locks support/i,
		message: () => t`This browser cannot safely coordinate funds operations across tabs. Use a supported browser.`,
	},
	{ pattern: /user rejected/i, message: () => t`Transaction was rejected` },
	{ pattern: /wallet connection request was rejected/i, message: () => t`Wallet connection request was rejected.` },
	{
		pattern:
			/wallet connection failed|failed to connect|restore.*session|unlock your wallet|wallet client not ready|wallet provider unavailable/i,
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
	{
		pattern: SMART_WALLET_NONCE_CONFLICT_PATTERN,
		message: () =>
			t`Smart wallet deposit state is syncing. Do not submit another deposit while the balance is being checked.`,
	},
] as const;

export function isSmartWalletNonceConflict(error: Error | null): boolean {
	return !!error && SMART_WALLET_NONCE_CONFLICT_PATTERN.test(error.message);
}

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

export function formatExchangeActionError(error: unknown, fallback: string): string {
	if (isAmbiguousExchangeActionError(error)) {
		return t`Request status could not be confirmed. Check balances and transfer history before retrying.`;
	}

	if (error instanceof Error) return formatTransferError(error);
	if (typeof error === "string") return formatTransferError(new Error(error));
	return fallback;
}

export function formatOrderPlanError(message: string): string {
	switch (message) {
		case `Scale levels must be ${SCALE_LEVELS_MIN}-${SCALE_LEVELS_MAX}`:
			return t`Scale levels must be ${SCALE_LEVELS_MIN}-${SCALE_LEVELS_MAX}`;
		case "Enter a valid scale price range":
			return t`Enter price range`;
		case "Enter a valid scale skew":
			return t`Enter a valid scale skew`;
		case "Scale size is too small for the selected number of orders":
			return t`Scale size is too small for the selected number of orders`;
		case "Size skew is too aggressive for the total size":
			return t`Size skew is too aggressive for the total size`;
		case "Scale prices must resolve to distinct ticks":
			return t`Scale prices must resolve to distinct ticks`;
		case "Scale level below min notional":
			return t`Scale level below min notional`;
		default:
			return message;
	}
}

export function isAmbiguousExchangeActionError(error: unknown): boolean {
	if (!isRecord(error) || error.name !== "HttpRequestError") return false;
	const status = getHttpStatus(error.response);
	if (status === undefined) return true;
	return status < 400 || status === 408 || status >= 500;
}

function getHttpStatus(response: unknown): number | undefined {
	if (!isRecord(response) || typeof response.status !== "number") return undefined;
	return response.status;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
