import { getInfoClient as getSdkInfoClient } from "@gatu/hl-react";
import { runWithFundsActionLock } from "@gatu/hl-react/internal/exchange/funds-action-lock";
import { msg } from "@lingui/core/macro";
import { type ConnectedWallet, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	Account,
	Address,
	Chain,
	Hash,
	Hex,
	PublicClient,
	TransactionReceipt,
	Transport,
	WalletClient,
} from "viem";
import { bytesToHex, createWalletClient, custom, encodeFunctionData, formatUnits, isAddress, parseUnits } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { useChainId, usePublicClient } from "wagmi";
import {
	CCTP_MAX_DEPOSIT_USDC,
	CCTP_TESTNET_MAX_DEPOSIT_USDC,
	type CctpDepositConfig,
	type CctpDepositNetwork,
	getCctpDepositConfig,
	isCctpExternalDepositEnabled,
	isCctpSponsoredDepositEnabled,
} from "@/config/cctp-deposit";
import { MIN_DEPOSIT_USDC, USDC_DECIMALS } from "@/config/contracts";
import {
	DEPOSIT_BROADCAST_TIMEOUT_MS,
	DEPOSIT_CONFIRMATION_TIMEOUT_MS,
	DEPOSIT_POLL_INTERVAL_MS,
	DEPOSIT_WALLET_RESPONSE_TIMEOUT_MS,
} from "@/config/time";
import { useFreshLegalActionGuard } from "@/hooks/trade/use-fresh-legal-action-guard";
import { useAssertFreshDepositRoute } from "@/hooks/trade/use-usdc-routing";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { createActionError } from "@/lib/errors/action-error";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
import {
	finishDepositExecution,
	isCurrentDepositExecution,
	resetDepositExecution,
	setBlockedDepositExecution,
	startDepositExecution,
	updateDepositExecutionState,
	useDepositExecutionState,
} from "@/lib/hyperliquid/deposit-execution-state";
import {
	DefinitiveDepositSourceFailureError,
	isDefinitiveDepositSourceFailure,
} from "@/lib/hyperliquid/deposit-source-error";
import {
	assertCctpDepositReceipt,
	assertCctpSponsoredDepositReceipt,
	buildCctpDepositContractArgs,
	buildCctpSponsoredDepositContractArgs,
	CCTP_EXTENSION_ABI,
	CCTP_EXTENSION_V2_ABI,
	calculateCctpDepositFee,
	createCctpDepositParameters,
	createCctpSponsoredDepositParameters,
	fetchCctpDepositFees,
	fetchCctpFastAllowance,
	getHyperCoreRecipientState,
} from "@/lib/trade/cctp-deposit";
import {
	assertCctpDepositTrackingStorageWritable,
	readCctpDepositTrackingRecords,
	readCctpSponsoredAuthorizationIntent,
	removeCctpDepositTrackingRecord,
	removeCctpSponsoredAuthorizationIntent,
	saveCctpDepositTrackingRecord,
	saveCctpSponsoredAuthorizationIntent,
} from "@/lib/trade/cctp-deposit-tracking";
import type { Translate } from "@/lib/translate";
import { hasSameWalletAddress, isPrivyEmbeddedWallet } from "@/lib/wallet/privy-wagmi";
import { useIsTestnet } from "@/stores/use-global-settings-store";

export type DepositStatus = "idle" | "pending" | "confirming" | "success" | "error";
type BalanceStatus = "idle" | "loading" | "success" | "error";
type DepositMode = "wallet" | "smart";
export type DepositRoute = "bridge" | "cctp";
type DepositExecutionScope = "manual" | "automatic";
type DepositNetwork = CctpDepositNetwork;
type WalletProviderStatus = "idle" | "loading" | "ready" | "error";

export type SponsoredCctpReadinessFailure =
	| "build-gate-disabled"
	| "smart-client-unavailable"
	| "wrong-chain"
	| "paymaster-unavailable";

export interface SponsoredCctpReadiness {
	status: "idle" | "loading" | "ready" | "error";
	failure: SponsoredCctpReadinessFailure | null;
	retry: () => void;
}

interface ValidationResult {
	valid: boolean;
	error: string | null;
}

export interface DepositReview {
	expectedBalanceRaw?: bigint;
	expectedCctpMaxFeeRaw?: bigint;
}

export interface UseDepositResult {
	isArbitrum: boolean;
	switchToArbitrum: () => void;
	isSwitching: boolean;
	switchError: Error | null;
	walletProviderStatus: WalletProviderStatus;
	walletProviderError: Error | null;
	networkName: string;
	sponsoredCctpEnabled: boolean;
	sponsoredCctpReadiness: SponsoredCctpReadiness;
	depositRoute: DepositRoute;
	balance: string;
	balanceRaw: bigint | undefined;
	maxAmount: string;
	maxDepositRaw: bigint | undefined;
	balanceStatus: BalanceStatus;
	balanceError: Error | null;
	status: DepositStatus;
	error: Error | null;
	hash: Hash | undefined;
	executionAmount: string | null;
	executionRoute: DepositRoute | null;
	cctpRecoveryUnavailable: boolean;
	submissionOutcomeUnknown: boolean;
	walletResponseDelayed: boolean;
	deposit: (amount: string, review?: DepositReview) => Promise<void>;
	refreshBalance: () => Promise<bigint | undefined>;
	validate: (amount: string, translate: Translate) => ValidationResult;
	reset: () => void;
}

interface UseDepositOptions {
	balanceEnabled?: boolean;
	balancePollIntervalMs?: number;
	mode?: DepositMode;
	executionScope?: DepositExecutionScope;
	walletAddress?: `0x${string}`;
	depositRoute: DepositRoute;
	expectedCctpMaxFeeRaw?: bigint;
	sponsoredReadinessEnabled?: boolean;
}

interface UsdcBalanceState {
	key: string;
	status: BalanceStatus;
	raw: bigint | undefined;
	error: Error | null;
}

interface ArbitrumSwitchState {
	key: string;
	confirmedChainId: number | null;
	error: Error | null;
}

interface ProviderChainState {
	key: string;
	chainId: number | null;
	status: WalletProviderStatus;
	error: Error | null;
}

interface SponsoredCctpReadinessState {
	key: string;
	status: SponsoredCctpReadiness["status"];
	failure: SponsoredCctpReadinessFailure | null;
}

type ReadyWalletClient = WalletClient<Transport, Chain, Account>;

interface ReadyDepositContext {
	address: `0x${string}`;
	provider: Eip1193Provider;
	publicClient: PublicClient;
	walletClient: ReadyWalletClient;
}

interface Eip1193Provider {
	request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
	on?(event: "chainChanged", listener: (chainId: string) => void): void;
	removeListener?(event: "chainChanged", listener: (chainId: string) => void): void;
}

interface RpcTransactionLike {
	blockNumber?: unknown;
}

interface RpcTransactionReceiptLike {
	status?: unknown;
}

interface ProviderRpcErrorLike {
	code?: number;
	message?: string;
}

const BALANCE_OF_SELECTOR = "0x70a08231";
const GAS_BUFFER_NUMERATOR = 12n;
const GAS_BUFFER_DENOMINATOR = 10n;
const DEPOSIT_CHAINS = {
	mainnet: arbitrum,
	testnet: arbitrumSepolia,
} as const;
function createAuthorizationNonce(): Hex {
	if (!globalThis.crypto?.getRandomValues)
		throw new LocalizedActionError(msg`Secure randomness is unavailable. Deposit was not submitted.`);
	const bytes = new Uint8Array(32);
	globalThis.crypto.getRandomValues(bytes);
	return bytesToHex(bytes);
}

function getDepositNetwork(isTestnet: boolean): DepositNetwork {
	return isTestnet ? "testnet" : "mainnet";
}

function getDepositChain(network: DepositNetwork): Chain {
	return DEPOSIT_CHAINS[network];
}

function validateAmount(amount: string, maxDepositRaw: bigint | undefined, translate: Translate): ValidationResult {
	const trimmed = amount.trim();
	if (!trimmed) return { valid: false, error: null };
	if (maxDepositRaw === undefined) return { valid: false, error: null };

	try {
		const raw = parseUnits(trimmed, USDC_DECIMALS);
		if (raw === 0n) return { valid: false, error: null };
		if (raw < MIN_DEPOSIT_USDC) return { valid: false, error: translate(msg`Minimum deposit is 5 USDC`) };
		if (raw > maxDepositRaw) return { valid: false, error: translate(msg`Insufficient balance`) };
		return { valid: true, error: null };
	} catch {
		return { valid: false, error: translate(msg`Invalid amount`) };
	}
}

function createArbitrumSwitchState(key = ""): ArbitrumSwitchState {
	return { key, confirmedChainId: null, error: null };
}

function createProviderChainState(
	key = "",
	status: WalletProviderStatus = "idle",
	error: Error | null = null,
): ProviderChainState {
	return { key, chainId: null, status, error };
}

function createIdleBalanceState(key = ""): UsdcBalanceState {
	return { key, status: "idle", raw: undefined, error: null };
}

function createSponsoredCctpReadinessState(
	key: string,
	status: SponsoredCctpReadiness["status"],
	failure: SponsoredCctpReadinessFailure | null = null,
): SponsoredCctpReadinessState {
	return { key, status, failure };
}

function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(typeof error === "string" ? error : "Unknown error");
}

function getProviderRpcError(error: unknown): ProviderRpcErrorLike {
	if (error && typeof error === "object") return error as ProviderRpcErrorLike;
	return {};
}

function getProviderErrorMessage(error: unknown): string {
	return getProviderRpcError(error).message ?? toError(error).message;
}

function isUserRejectedRequest(error: unknown) {
	const { code } = getProviderRpcError(error);
	return (
		code === 4001 ||
		/user rejected|user denied|rejected the request|request rejected/i.test(getProviderErrorMessage(error))
	);
}

function isUnknownChainError(error: unknown) {
	const { code } = getProviderRpcError(error);
	return code === 4902 || /unrecognized chain|unknown chain|add ethereum chain/i.test(getProviderErrorMessage(error));
}

function isNetworkRequestError(error: unknown) {
	return /http request failed|failed to fetch|fetch failed|network error/i.test(toError(error).message);
}

function isRevertedReceipt(receipt: RpcTransactionReceiptLike) {
	return receipt.status === "reverted" || receipt.status === "0x0" || receipt.status === 0;
}

function isPendingTransaction(transaction: RpcTransactionLike | null) {
	return !!transaction && transaction.blockNumber === null;
}

function createWalletConnectionError(error: unknown): LocalizedActionError {
	if (isUserRejectedRequest(error)) {
		return new LocalizedActionError(msg`Wallet connection request was rejected.`, { cause: error });
	}
	if (/unlock/i.test(getProviderErrorMessage(error))) {
		return new LocalizedActionError(msg`Unlock your wallet and try again.`, { cause: error });
	}
	return createActionError("wallet-unavailable", { cause: error });
}

function createChainSwitchError(config: DepositChainConfig, error: unknown): LocalizedActionError {
	if (isUserRejectedRequest(error)) {
		return new LocalizedActionError(msg`Arbitrum network switch was rejected.`, { cause: error });
	}
	return new LocalizedActionError(
		msg`Unable to switch wallet to ${config.chainName}. Switch networks in your wallet and retry.`,
		{ cause: error },
	);
}

function sleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function toChainHex(chainId: number): `0x${string}` {
	return `0x${chainId.toString(16)}` as const;
}

function parseChainId(chainId: unknown): number | null {
	if (typeof chainId === "number" && Number.isFinite(chainId)) return chainId;
	if (typeof chainId !== "string" || !chainId) return null;
	const parsed = chainId.startsWith("0x") ? Number.parseInt(chainId, 16) : Number(chainId);
	return Number.isFinite(parsed) ? parsed : null;
}

function getClientChainId(client: unknown): number | null {
	if (!client || typeof client !== "object" || !("chain" in client)) return null;
	const { chain } = client;
	if (!chain || typeof chain !== "object" || !("id" in chain)) return null;
	return typeof chain.id === "number" && Number.isFinite(chain.id) ? chain.id : null;
}

function encodeBalanceOf(address: `0x${string}`): `0x${string}` {
	return `${BALANCE_OF_SELECTOR}${address.slice(2).padStart(64, "0")}` as `0x${string}`;
}

async function readDepositUsdcBalance(
	config: DepositChainConfig,
	address: `0x${string}`,
	signal?: AbortSignal,
): Promise<bigint> {
	const response = await fetch(config.rpcUrl, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "eth_call",
			params: [
				{
					to: config.usdc,
					data: encodeBalanceOf(address),
				},
				"latest",
			],
		}),
		signal,
	});

	if (!response.ok) throw new LocalizedActionError(msg`Unable to load Arbitrum USDC balance`);

	const payload = (await response.json()) as { result?: string; error?: { message?: string } };
	if (payload.error) {
		throw new LocalizedActionError(msg`Unable to load Arbitrum USDC balance`, { cause: payload.error });
	}
	if (!payload.result) throw new LocalizedActionError(msg`Unable to load Arbitrum USDC balance`);
	return BigInt(payload.result);
}

function getWalletChainId(wallet: ConnectedWallet): number | null {
	const rawChainId = wallet.chainId.split(":").pop();
	if (!rawChainId) return null;
	const chainId = Number(rawChainId);
	return Number.isFinite(chainId) ? chainId : null;
}

function selectDepositWallet(
	wallets: ConnectedWallet[],
	address: `0x${string}` | undefined,
	requireEmbedded: boolean,
): ConnectedWallet | undefined {
	if (!address) return undefined;
	return wallets.find(
		(wallet) => hasSameWalletAddress(wallet.address, address) && (!requireEmbedded || isPrivyEmbeddedWallet(wallet)),
	);
}

async function getDepositProvider(wallet: ConnectedWallet): Promise<Eip1193Provider> {
	try {
		return (await wallet.getEthereumProvider()) as Eip1193Provider;
	} catch (error) {
		throw createWalletConnectionError(error);
	}
}

function assertConnectedAccount(accounts: unknown, address: `0x${string}`) {
	if (!Array.isArray(accounts)) throw createActionError("wallet-unavailable");
	if (!accounts.some((account) => typeof account === "string" && hasSameWalletAddress(account, address))) {
		throw createActionError("wallet-mismatch");
	}
}

async function ensureProviderAccount(provider: Eip1193Provider, address: `0x${string}`) {
	let accounts: unknown;

	try {
		accounts = await provider.request({ method: "eth_accounts" });
	} catch {
		accounts = [];
	}

	if (
		Array.isArray(accounts) &&
		accounts.some((account) => typeof account === "string" && hasSameWalletAddress(account, address))
	) {
		return;
	}

	try {
		accounts = await provider.request({ method: "eth_requestAccounts" });
	} catch (error) {
		throw createWalletConnectionError(error);
	}

	assertConnectedAccount(accounts, address);
}

async function assertProviderAccountStillActive(provider: Eip1193Provider, address: `0x${string}`) {
	let accounts: unknown;
	try {
		accounts = await provider.request({ method: "eth_accounts" });
	} catch (error) {
		throw createWalletConnectionError(error);
	}
	assertConnectedAccount(accounts, address);
}

async function getProviderChainId(provider: Eip1193Provider): Promise<string> {
	try {
		const chainId = await provider.request({ method: "eth_chainId" });
		return typeof chainId === "string" ? chainId.toLowerCase() : "";
	} catch (error) {
		throw createWalletConnectionError(error);
	}
}

function getAddChainParams(config: DepositChainConfig) {
	return {
		chainId: toChainHex(config.chainId),
		chainName: config.chainName,
		nativeCurrency: {
			name: "Ether",
			symbol: "ETH",
			decimals: 18,
		},
		rpcUrls: [config.rpcUrl],
		blockExplorerUrls: [config.blockExplorerUrl],
	} as const;
}

async function requestDepositChainSwitch(provider: Eip1193Provider, config: DepositChainConfig) {
	const chainId = toChainHex(config.chainId);
	try {
		await provider.request({
			method: "wallet_switchEthereumChain",
			params: [{ chainId }],
		});
	} catch (error) {
		if (!isUnknownChainError(error)) throw createChainSwitchError(config, error);

		try {
			await provider.request({
				method: "wallet_addEthereumChain",
				params: [getAddChainParams(config)],
			});
		} catch (addError) {
			throw createChainSwitchError(config, addError);
		}

		try {
			await provider.request({
				method: "wallet_switchEthereumChain",
				params: [{ chainId }],
			});
		} catch (switchError) {
			throw createChainSwitchError(config, switchError);
		}
	}
}

async function ensureDepositChain(provider: Eip1193Provider, config: DepositChainConfig) {
	const chainId = toChainHex(config.chainId);
	const currentChainId = await getProviderChainId(provider);
	if (currentChainId !== chainId) {
		await requestDepositChainSwitch(provider, config);
	}

	const nextChainId = await getProviderChainId(provider);
	if (nextChainId !== chainId) {
		throw new LocalizedActionError(
			msg`Wallet is not connected to ${config.chainName}. Switch networks in your wallet and retry.`,
		);
	}
}

async function assertDepositChainStillActive(provider: Eip1193Provider, config: DepositChainConfig) {
	if ((await getProviderChainId(provider)) !== toChainHex(config.chainId)) {
		throw new LocalizedActionError(
			msg`Wallet is not connected to ${config.chainName}. Switch networks in your wallet and retry.`,
		);
	}
}

async function switchDepositWalletChain(
	wallet: ConnectedWallet,
	provider: Eip1193Provider,
	config: DepositChainConfig,
) {
	try {
		await wallet.switchChain(config.chainId);
		return;
	} catch (error) {
		if (!isUnknownChainError(error)) throw createChainSwitchError(config, error);
	}

	await requestDepositChainSwitch(provider, config);
}

async function getDepositProviderForChain(wallet: ConnectedWallet, config: DepositChainConfig) {
	const provider = await getDepositProvider(wallet);
	const providerChainId = await getProviderChainId(provider);
	if (providerChainId === toChainHex(config.chainId)) return provider;

	await switchDepositWalletChain(wallet, provider, config);

	const nextProvider = await getDepositProvider(wallet);
	await ensureDepositChain(nextProvider, config);
	return nextProvider;
}

async function fetchCctpDepositTerms(config: CctpDepositConfig) {
	try {
		return await Promise.all([fetchCctpDepositFees(config), fetchCctpFastAllowance(config)]);
	} catch (cause) {
		throw new LocalizedActionError(msg`Unable to verify the current Circle CCTP fee and Fast Transfer capacity.`, {
			cause,
		});
	}
}

export function waitForWalletTransactionHash<T>(
	promise: Promise<T>,
	timeoutMs = DEPOSIT_WALLET_RESPONSE_TIMEOUT_MS,
	onDelayed?: () => void,
): Promise<T> {
	const timeoutId = setTimeout(() => onDelayed?.(), timeoutMs);
	return promise.finally(() => clearTimeout(timeoutId));
}

async function getReadyWalletDepositContext({
	address,
	chain,
	config,
	publicClient,
	wallet,
}: {
	address: `0x${string}` | undefined;
	chain: Chain;
	config: DepositChainConfig;
	publicClient: PublicClient | undefined;
	wallet: ConnectedWallet | undefined;
}): Promise<ReadyDepositContext> {
	if (!address) throw new LocalizedActionError(msg`Wallet not connected`);
	if (!publicClient) throw new LocalizedActionError(msg`No response from exchange`);
	if (!wallet) throw new LocalizedActionError(msg`Wallet client not ready`);
	if (!hasSameWalletAddress(wallet.address, address)) throw createActionError("wallet-mismatch");

	const provider = await getDepositProviderForChain(wallet, config);
	await ensureProviderAccount(provider, address);

	const walletClient = createWalletClient({
		account: address,
		chain,
		transport: custom(provider),
	});

	return { address, provider, publicClient, walletClient: walletClient as ReadyWalletClient };
}

async function getReadyPermitSignerContext({
	address,
	chain,
	publicClient,
	wallet,
}: {
	address: `0x${string}` | undefined;
	chain: Chain;
	publicClient: PublicClient | undefined;
	wallet: ConnectedWallet | undefined;
}): Promise<ReadyDepositContext> {
	if (!address) throw new LocalizedActionError(msg`Wallet not connected`);
	if (!publicClient) throw new LocalizedActionError(msg`No response from exchange`);
	if (!wallet) throw new LocalizedActionError(msg`Wallet client not ready`);
	if (!hasSameWalletAddress(wallet.address, address)) throw createActionError("wallet-mismatch");

	const provider = await getDepositProvider(wallet);
	await ensureProviderAccount(provider, address);

	const walletClient = createWalletClient({
		account: address,
		chain,
		transport: custom(provider),
	});

	return { address, provider, publicClient, walletClient: walletClient as ReadyWalletClient };
}

async function getProviderTransactionReceipt(provider: Eip1193Provider | undefined, hash: Hash) {
	if (!provider) return null;
	const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [hash] });
	return receipt && typeof receipt === "object" ? (receipt as TransactionReceipt) : null;
}

async function getProviderTransaction(provider: Eip1193Provider | undefined, hash: Hash) {
	if (!provider) return null;
	const transaction = await provider.request({ method: "eth_getTransactionByHash", params: [hash] });
	return transaction && typeof transaction === "object" ? (transaction as RpcTransactionLike) : null;
}

export async function waitForBroadcastedTransaction(
	publicClient: PublicClient,
	hash: Hash,
	options: { provider?: Eip1193Provider; timeoutMs?: number; pollingIntervalMs?: number } = {},
) {
	const timeoutMs = options.timeoutMs ?? DEPOSIT_BROADCAST_TIMEOUT_MS;
	const pollingIntervalMs = options.pollingIntervalMs ?? DEPOSIT_POLL_INTERVAL_MS;
	const deadline = Date.now() + timeoutMs;

	while (true) {
		try {
			const receipt = await publicClient.getTransactionReceipt({ hash });
			if (receipt) return;
		} catch {}

		try {
			const transaction = await publicClient.getTransaction({ hash });
			if (transaction) return;
		} catch {}

		const remainingMs = deadline - Date.now();
		if (remainingMs <= 0) break;
		await sleep(Math.min(pollingIntervalMs, remainingMs));
	}

	throw new LocalizedActionError(
		msg`Wallet returned a transaction hash, but it is not visible on Arbitrum yet. Check your wallet activity or Arbiscan before retrying to avoid sending the deposit twice.`,
	);
}

export async function waitForConfirmedReceipt(
	publicClient: PublicClient,
	hash: Hash,
	options: { provider?: Eip1193Provider; timeoutMs?: number; pollingIntervalMs?: number } = {},
) {
	const timeoutMs = options.timeoutMs ?? DEPOSIT_CONFIRMATION_TIMEOUT_MS;
	const pollingIntervalMs = options.pollingIntervalMs ?? DEPOSIT_POLL_INTERVAL_MS;
	const deadline = Date.now() + timeoutMs;
	let lastError: Error | null = null;

	while (true) {
		let publicReceipt: TransactionReceipt | null = null;
		try {
			publicReceipt = await publicClient.getTransactionReceipt({ hash });
		} catch (error) {
			lastError = toError(error);
		}

		if (publicReceipt) {
			if (isRevertedReceipt(publicReceipt)) {
				throw new DefinitiveDepositSourceFailureError(
					"source-transaction-reverted",
					"Transaction reverted on Arbitrum",
				);
			}
			return publicReceipt;
		}

		const remainingMs = deadline - Date.now();
		if (remainingMs <= 0) break;
		await sleep(Math.min(pollingIntervalMs, remainingMs));
	}

	let providerReceipt: TransactionReceipt | null = null;
	try {
		providerReceipt = await getProviderTransactionReceipt(options.provider, hash);
	} catch (error) {
		lastError = toError(error);
	}
	if (providerReceipt && isRevertedReceipt(providerReceipt)) {
		throw new DefinitiveDepositSourceFailureError("source-transaction-reverted", "Transaction reverted on Arbitrum");
	}

	let transaction: RpcTransactionLike | null = null;
	try {
		transaction = await publicClient.getTransaction({ hash });
	} catch (error) {
		lastError = toError(error);
	}

	if (!transaction) {
		try {
			transaction = await getProviderTransaction(options.provider, hash);
		} catch (error) {
			lastError = toError(error);
		}
	}

	if (isPendingTransaction(transaction)) {
		throw new LocalizedActionError(
			msg`Deposit transaction was submitted but did not confirm on Arbitrum. Your wallet nonce may be out of sync with the network. Clear pending activity or reset nonce data in your wallet, then retry.`,
		);
	}

	if (lastError && isNetworkRequestError(lastError)) {
		throw new LocalizedActionError(
			msg`Deposit transaction was broadcast, but Arbitrum RPC confirmation failed. Check Arbiscan before retrying.`,
			{ cause: lastError },
		);
	}

	throw new LocalizedActionError(
		msg`Deposit transaction was broadcast but confirmation timed out. Check Arbiscan before retrying.`,
	);
}

interface DepositChainConfig {
	chainId: number;
	chainName: string;
	displayName: string;
	rpcUrl: string;
	blockExplorerUrl: string;
	usdc: Address;
}

function useDepositChain(
	wallet: ConnectedWallet | undefined,
	address: `0x${string}` | undefined,
	config: DepositChainConfig,
	enabled: boolean,
) {
	const chainId = useChainId();
	const walletKey = `${address ?? ""}:${wallet?.address ?? ""}:${wallet?.chainId ?? ""}:${config.chainId}`;
	const [switchState, setSwitchState] = useState<ArbitrumSwitchState>(createArbitrumSwitchState);
	const [providerChainState, setProviderChainState] = useState<ProviderChainState>(createProviderChainState);
	const [isSwitching, setIsSwitching] = useState(false);

	useEffect(() => {
		if (!enabled || !address || !wallet) {
			setProviderChainState(
				enabled && address
					? createProviderChainState(walletKey, "error", new LocalizedActionError(msg`Wallet client not ready`))
					: createProviderChainState(),
			);
			return;
		}

		let cancelled = false;
		let provider: Eip1193Provider | undefined;
		let chainChangedHandler: ((nextChainId: string) => void) | undefined;

		setProviderChainState(createProviderChainState(walletKey, "loading"));

		void (async () => {
			try {
				provider = await getDepositProvider(wallet);
				const rawChainId = await provider.request({ method: "eth_chainId" });
				if (cancelled) return;

				setProviderChainState({ key: walletKey, chainId: parseChainId(rawChainId), status: "ready", error: null });
				chainChangedHandler = (nextChainId: string) => {
					setProviderChainState({ key: walletKey, chainId: parseChainId(nextChainId), status: "ready", error: null });
				};
				provider.on?.("chainChanged", chainChangedHandler);
			} catch (error) {
				if (!cancelled) setProviderChainState(createProviderChainState(walletKey, "error", toError(error)));
			}
		})();

		return () => {
			cancelled = true;
			if (provider && chainChangedHandler) {
				provider.removeListener?.("chainChanged", chainChangedHandler);
			}
		};
	}, [address, enabled, wallet, walletKey]);

	const switchToArbitrum = useCallback(() => {
		if (!enabled) return;
		if (!address || !wallet) {
			setSwitchState({
				...createArbitrumSwitchState(walletKey),
				error: new LocalizedActionError(msg`Wallet not connected`),
			});
			return;
		}

		setIsSwitching(true);
		setSwitchState(createArbitrumSwitchState(walletKey));
		void (async () => {
			const provider = await getDepositProvider(wallet);
			await ensureProviderAccount(provider, address);
			await switchDepositWalletChain(wallet, provider, config);
			const nextProvider = await getDepositProvider(wallet);
			await ensureDepositChain(nextProvider, config);
			const rawChainId = await nextProvider.request({ method: "eth_chainId" });
			setProviderChainState({ key: walletKey, chainId: parseChainId(rawChainId), status: "ready", error: null });
			setSwitchState({ key: walletKey, confirmedChainId: config.chainId, error: null });
		})()
			.catch((error) => setSwitchState({ ...createArbitrumSwitchState(walletKey), error: toError(error) }))
			.finally(() => setIsSwitching(false));
	}, [address, config, enabled, wallet, walletKey]);

	if (!enabled) {
		return {
			isArbitrum: true,
			switchToArbitrum,
			isSwitching,
			switchError: null,
			walletProviderStatus: "idle" as const,
			walletProviderError: null,
		};
	}

	const walletChainId = wallet ? getWalletChainId(wallet) : null;
	const confirmedChainId = switchState.key === walletKey ? switchState.confirmedChainId : null;
	const currentProviderChainState = providerChainState.key === walletKey ? providerChainState : null;
	const providerChainId = currentProviderChainState?.chainId ?? null;
	const effectiveChainId = confirmedChainId ?? providerChainId ?? chainId ?? walletChainId;
	const walletProviderStatus =
		!address || !wallet ? "error" : (currentProviderChainState?.status ?? ("loading" as WalletProviderStatus));
	const walletProviderError =
		!address || !wallet
			? new LocalizedActionError(msg`Wallet client not ready`)
			: (currentProviderChainState?.error ?? null);

	return {
		isArbitrum: effectiveChainId === config.chainId,
		switchToArbitrum,
		isSwitching,
		switchError: switchState.key === walletKey ? switchState.error : null,
		walletProviderStatus,
		walletProviderError,
	};
}

function useDepositUsdcBalance(
	config: DepositChainConfig,
	address: `0x${string}` | undefined,
	enabled: boolean,
	pollIntervalMs?: number,
) {
	const [state, setState] = useState<UsdcBalanceState>(createIdleBalanceState);
	const requestIdRef = useRef(0);
	const balanceKey = `${config.chainId}:${config.usdc.toLowerCase()}:${address?.toLowerCase() ?? ""}`;
	const currentState = state.key === balanceKey ? state : createIdleBalanceState(balanceKey);

	const refetch = useCallback(async (): Promise<bigint | undefined> => {
		if (!enabled || !address) {
			setState(createIdleBalanceState(balanceKey));
			return undefined;
		}

		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;
		const abortController = new AbortController();

		setState((previous) => ({
			key: balanceKey,
			status: "loading",
			raw: previous.key === balanceKey ? previous.raw : undefined,
			error: null,
		}));

		try {
			const raw = await readDepositUsdcBalance(config, address, abortController.signal);
			if (requestIdRef.current !== requestId) return undefined;
			setState({ key: balanceKey, status: "success", raw, error: null });
			return raw;
		} catch (error) {
			if (abortController.signal.aborted || requestIdRef.current !== requestId) return undefined;
			setState((previous) => ({
				key: balanceKey,
				status: "error",
				raw: previous.key === balanceKey ? previous.raw : undefined,
				error: toError(error),
			}));
			return undefined;
		}
	}, [address, balanceKey, config, enabled]);

	useEffect(() => {
		if (!enabled || !address) {
			requestIdRef.current += 1;
			setState(createIdleBalanceState(balanceKey));
			return;
		}

		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;
		const abortController = new AbortController();

		setState({ key: balanceKey, status: "loading", raw: undefined, error: null });

		void readDepositUsdcBalance(config, address, abortController.signal)
			.then((raw) => {
				if (requestIdRef.current !== requestId) return;
				setState({ key: balanceKey, status: "success", raw, error: null });
			})
			.catch((error) => {
				if (abortController.signal.aborted || requestIdRef.current !== requestId) return;
				setState({ key: balanceKey, status: "error", raw: undefined, error: toError(error) });
			});

		return () => {
			abortController.abort();
		};
	}, [address, balanceKey, config, enabled]);

	useEffect(() => {
		if (!enabled || !address || !pollIntervalMs) return;

		const interval = window.setInterval(() => {
			void refetch();
		}, pollIntervalMs);

		return () => window.clearInterval(interval);
	}, [address, enabled, pollIntervalMs, refetch]);

	const balance = useMemo(
		() => (currentState.raw !== undefined ? formatUnits(currentState.raw, USDC_DECIMALS) : "0"),
		[currentState.raw],
	);
	const maxDepositRaw = currentState.raw;
	const maxAmount = useMemo(
		() => (maxDepositRaw !== undefined ? formatUnits(maxDepositRaw, USDC_DECIMALS) : "0"),
		[maxDepositRaw],
	);

	return {
		balanceRaw: currentState.raw,
		maxDepositRaw,
		balance,
		maxAmount,
		status: currentState.status,
		error: currentState.error,
		refetch,
	};
}

function useSponsoredCctpReadiness({
	chainId,
	enabled,
	featureEnabled,
	getClientForChain,
	wallet,
	walletAddress,
	walletsReady,
}: {
	chainId: number;
	enabled: boolean;
	featureEnabled: boolean;
	getClientForChain: ReturnType<typeof useSmartWallets>["getClientForChain"];
	wallet: ConnectedWallet | undefined;
	walletAddress: `0x${string}` | undefined;
	walletsReady: boolean;
}): SponsoredCctpReadiness {
	const [retryAttempt, setRetryAttempt] = useState(0);
	const [state, setState] = useState<SponsoredCctpReadinessState>(() => createSponsoredCctpReadinessState("", "idle"));
	const requestIdRef = useRef(0);
	const readinessKey = [
		enabled ? "enabled" : "disabled",
		featureEnabled ? "released" : "gated",
		chainId,
		walletAddress?.toLowerCase() ?? "no-address",
		wallet?.address.toLowerCase() ?? "no-wallet",
		wallet?.chainId ?? "no-chain",
		walletsReady ? "wallets-ready" : "wallets-loading",
		retryAttempt,
	].join(":");
	const inputStatus: SponsoredCctpReadiness["status"] = !enabled
		? "idle"
		: !featureEnabled || (walletAddress && walletsReady && !wallet)
			? "error"
			: "loading";
	const inputFailure: SponsoredCctpReadinessFailure | null = !enabled
		? null
		: !featureEnabled
			? "build-gate-disabled"
			: walletAddress && walletsReady && !wallet
				? "smart-client-unavailable"
				: null;

	useEffect(() => {
		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;
		setState(createSponsoredCctpReadinessState(readinessKey, inputStatus, inputFailure));
		if (!enabled || !featureEnabled || !walletAddress || !walletsReady || !wallet) return;

		let cancelled = false;
		void (async () => {
			try {
				const client = await getClientForChain({ id: chainId });
				if (cancelled || requestIdRef.current !== requestId) return;
				if (!client) {
					setState(createSponsoredCctpReadinessState(readinessKey, "error", "smart-client-unavailable"));
					return;
				}

				const clientChainId = getClientChainId(client);
				if (clientChainId === null) {
					setState(createSponsoredCctpReadinessState(readinessKey, "error", "smart-client-unavailable"));
					return;
				}
				if (clientChainId !== chainId) {
					setState(createSponsoredCctpReadinessState(readinessKey, "error", "wrong-chain"));
					return;
				}
				if (!client.paymaster) {
					setState(createSponsoredCctpReadinessState(readinessKey, "error", "paymaster-unavailable"));
					return;
				}

				setState(createSponsoredCctpReadinessState(readinessKey, "ready"));
			} catch {
				if (!cancelled && requestIdRef.current === requestId) {
					setState(createSponsoredCctpReadinessState(readinessKey, "error", "smart-client-unavailable"));
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [
		chainId,
		enabled,
		featureEnabled,
		getClientForChain,
		inputFailure,
		inputStatus,
		readinessKey,
		wallet,
		walletAddress,
		walletsReady,
	]);

	const retry = useCallback(() => {
		requestIdRef.current += 1;
		setState(createSponsoredCctpReadinessState(readinessKey, inputStatus, inputFailure));
		setRetryAttempt((previous) => previous + 1);
	}, [inputFailure, inputStatus, readinessKey]);
	const currentState =
		state.key === readinessKey ? state : createSponsoredCctpReadinessState(readinessKey, inputStatus, inputFailure);

	return {
		status: currentState.status,
		failure: currentState.failure,
		retry,
	};
}

export function useDeposit({
	balanceEnabled = true,
	balancePollIntervalMs,
	mode = "wallet",
	executionScope = "manual",
	walletAddress: walletAddressOverride,
	depositRoute,
	expectedCctpMaxFeeRaw,
	sponsoredReadinessEnabled = false,
}: UseDepositOptions): UseDepositResult {
	const network = getDepositNetwork(useIsTestnet());
	const cctpDepositConfig = getCctpDepositConfig(network === "testnet");
	const depositChain = getDepositChain(network);
	const { walletAddress: sessionWalletAddress } = useWalletSession();
	const walletAddress = walletAddressOverride ?? sessionWalletAddress;
	const { ready: walletsReady, wallets } = useWallets();
	const { getClientForChain } = useSmartWallets();
	const depositWallet = useMemo(
		() => selectDepositWallet(wallets, walletAddress, mode === "smart"),
		[mode, wallets, walletAddress],
	);
	const sponsoredCctpEnabled = depositRoute === "cctp" && isCctpSponsoredDepositEnabled(network === "testnet");
	const sponsoredCctpReadiness = useSponsoredCctpReadiness({
		chainId: cctpDepositConfig.chainId,
		enabled: sponsoredReadinessEnabled && mode === "smart" && depositRoute === "cctp",
		featureEnabled: sponsoredCctpEnabled,
		getClientForChain,
		wallet: depositWallet,
		walletAddress,
		walletsReady,
	});
	const chain = useDepositChain(depositWallet, walletAddress, cctpDepositConfig, mode === "wallet");
	const {
		balanceRaw,
		maxDepositRaw,
		balance,
		maxAmount,
		status: balanceStatus,
		error: balanceError,
		refetch,
	} = useDepositUsdcBalance(cctpDepositConfig, walletAddress, balanceEnabled && !!walletAddress, balancePollIntervalMs);
	const publicClient = usePublicClient({ chainId: cctpDepositConfig.chainId });
	const executionKey = `${network}:${executionScope}:${mode}:${walletAddress?.toLowerCase() ?? "unavailable"}`;
	const executionLockKey = `${network}:${mode}:${walletAddress?.toLowerCase() ?? "unavailable"}`;
	const state = useDepositExecutionState(executionKey);
	const assertFreshSelectedDepositRoute = useAssertFreshDepositRoute(depositRoute);
	const { verify: verifyFreshLegalAction } = useFreshLegalActionGuard();
	const { retry: refreshGeoRestriction } = useGeoRestriction();

	const validate = useCallback(
		(amount: string, translate: Translate) => validateAmount(amount, maxDepositRaw, translate),
		[maxDepositRaw],
	);

	const deposit = useCallback(
		async (amount: string, review?: DepositReview) => {
			let cctpTrackingRecord: { env: "Mainnet" | "Testnet"; owner: `0x${string}`; sourceHash: Hash } | undefined;
			let cctpAuthorizationNonce: Hex | undefined;
			let sponsoredAuthorizationValidBefore: bigint | undefined;
			let cctpRecoveryUnavailable = false;
			let sponsoredSubmissionStarted = false;
			const operationId = startDepositExecution(executionKey, executionLockKey, amount, depositRoute);
			if (operationId === null) {
				setBlockedDepositExecution(
					executionKey,
					new LocalizedActionError(
						msg`Smart wallet deposit state is syncing. Do not submit another deposit while the balance is being checked.`,
					),
				);
				return;
			}

			try {
				await assertFreshSelectedDepositRoute();
				if (depositRoute !== "cctp") {
					throw new LocalizedActionError(
						msg`Legacy Bridge2 deposits are no longer accepted. This deposit was not submitted.`,
					);
				}
				const amountRaw = parseUnits(amount, USDC_DECIMALS);
				if (network === "mainnet" && mode === "smart") {
					if (
						executionScope !== "manual" ||
						review?.expectedBalanceRaw === undefined ||
						review.expectedCctpMaxFeeRaw === undefined
					) {
						throw new LocalizedActionError(msg`This confirmation is required before finishing.`);
					}
					if (amountRaw !== review.expectedBalanceRaw) {
						throw new LocalizedActionError(msg`Available amount is not verified`);
					}
				}
				const markWalletResponseDelayed = () => {
					updateDepositExecutionState(executionKey, operationId, (previous) =>
						previous.status === "pending" ? { ...previous, walletResponseDelayed: true } : previous,
					);
				};

				const ready =
					mode === "smart"
						? await getReadyPermitSignerContext({
								address: walletAddress,
								chain: depositChain,
								publicClient,
								wallet: depositWallet,
							})
						: await getReadyWalletDepositContext({
								address: walletAddress,
								chain: depositChain,
								config: cctpDepositConfig,
								publicClient,
								wallet: depositWallet,
							});
				if (mode === "smart") {
					if (!isCctpSponsoredDepositEnabled(network === "testnet")) {
						throw new LocalizedActionError(msg`Gas-sponsored CCTP deposits are not enabled for this network.`);
					}
				} else if (!isCctpExternalDepositEnabled(network === "testnet")) {
					throw new LocalizedActionError(
						msg`CCTP deposits are awaiting funded end-to-end verification for this network.`,
					);
				}
				if (!isAddress(ready.address)) throw new LocalizedActionError(msg`Wallet not connected`);
				const provider = mode === "wallet" ? ready.provider : undefined;
				const cctpDepositUser = ready.address;
				const cctpTrackingEnv = network === "testnet" ? "Testnet" : "Mainnet";
				const hash = await runWithFundsActionLock(cctpTrackingEnv, ready.address, async () => {
					const freshGeo = await refreshGeoRestriction();
					if (freshGeo.isError || !freshGeo.data?.country || !/^[A-Z]{2}$/.test(freshGeo.data.country)) {
						throw new LocalizedActionError(
							msg`Unable to verify regional availability. This deposit was not submitted.`,
						);
					}
					if (freshGeo.data.tradeRestricted || freshGeo.data.proxy) {
						throw new LocalizedActionError(
							msg`Deposits are not available in your region. This deposit was not submitted.`,
						);
					}
					if (amountRaw > CCTP_MAX_DEPOSIT_USDC) {
						throw new LocalizedActionError(msg`Circle CCTP deposits are limited to 10,000,000 USDC per transfer.`);
					}
					if (network === "testnet" && amountRaw > CCTP_TESTNET_MAX_DEPOSIT_USDC) {
						throw new LocalizedActionError(msg`Circle testnet deposits are limited to 1,000 USDC per transfer.`);
					}
					if (readCctpDepositTrackingRecords(cctpTrackingEnv, ready.address).length > 0) {
						throw new LocalizedActionError(
							msg`Another Circle CCTP deposit is still pending for this account. Wait for it to finish before submitting another deposit.`,
						);
					}
					if (mode === "smart" && readCctpSponsoredAuthorizationIntent(cctpTrackingEnv, ready.address)) {
						throw new LocalizedActionError(
							msg`Another Circle CCTP deposit is still pending for this account. Wait for it to finish before submitting another deposit.`,
						);
					}
					assertCctpDepositTrackingStorageWritable(cctpTrackingEnv, ready.address);
					async function assertReviewedBalanceUnchanged() {
						if (review?.expectedBalanceRaw === undefined) return;
						const freshBalanceRaw = await readDepositUsdcBalance(cctpDepositConfig, ready.address);
						if (amountRaw !== review.expectedBalanceRaw || freshBalanceRaw !== review.expectedBalanceRaw) {
							throw new LocalizedActionError(msg`Available amount is not verified`);
						}
					}
					await assertFreshSelectedDepositRoute();
					const mainnetRoleRequest = getSdkInfoClient(false).userRole({ user: ready.address });
					const recipientRoles =
						network === "testnet"
							? await Promise.all([mainnetRoleRequest, getSdkInfoClient(true).userRole({ user: ready.address })])
							: [await mainnetRoleRequest];
					const mainnetRecipientState = getHyperCoreRecipientState(recipientRoles[0]);
					const destinationRecipientState =
						network === "testnet" ? getHyperCoreRecipientState(recipientRoles[1]) : mainnetRecipientState;
					if (mainnetRecipientState === "agent" || destinationRecipientState === "agent") {
						throw new LocalizedActionError(
							msg`Agent/API wallet addresses cannot receive CCTP deposits. Connect the owner account instead.`,
						);
					}
					if (network === "testnet" && mainnetRecipientState === "missing") {
						throw new LocalizedActionError(
							msg`Circle testnet deposits require this address to already exist on Hyperliquid mainnet.`,
						);
					}
					const [feeQuote, fastAllowanceRaw] = await fetchCctpDepositTerms(cctpDepositConfig);
					if (fastAllowanceRaw < amountRaw) {
						throw new LocalizedActionError(
							msg`Circle Fast Transfer capacity is temporarily unavailable. Try again later.`,
						);
					}
					const parameters =
						mode === "smart"
							? createCctpSponsoredDepositParameters({
									amountRaw,
									config: cctpDepositConfig,
									feeQuote,
									nowSeconds: Math.floor(Date.now() / 1000),
									user: ready.address as Address,
								})
							: createCctpDepositParameters({
									amountRaw,
									config: cctpDepositConfig,
									feeQuote,
									nonce: createAuthorizationNonce(),
									nowSeconds: Math.floor(Date.now() / 1000),
									user: ready.address as Address,
								});
					const reviewedCctpMaxFeeRaw = review?.expectedCctpMaxFeeRaw ?? expectedCctpMaxFeeRaw;
					if (
						executionScope === "manual" &&
						(reviewedCctpMaxFeeRaw === undefined || parameters.depositForBurn.maxFee !== reviewedCctpMaxFeeRaw)
					) {
						throw new LocalizedActionError(
							msg`Circle fees changed before submission. Review the updated fee and retry.`,
						);
					}
					const smartClient = mode === "smart" ? await getClientForChain({ id: cctpDepositConfig.chainId }) : undefined;
					if (mode === "smart") {
						if (!smartClient) throw new LocalizedActionError(msg`Smart wallet client not ready`);
						if (getClientChainId(smartClient) !== cctpDepositConfig.chainId) {
							throw new LocalizedActionError(msg`Smart wallet client not ready`);
						}
						if (!smartClient.paymaster) {
							throw new LocalizedActionError(msg`Gas-sponsored CCTP deposits are not enabled for this network.`);
						}
					}
					await assertReviewedBalanceUnchanged();
					await assertFreshSelectedDepositRoute();
					const authorizationSignature = await ready.walletClient.signTypedData({
						account: ready.address,
						...parameters.typedData,
					});
					await assertFreshSelectedDepositRoute();
					const [freshFeeQuote, freshFastAllowanceRaw] = await fetchCctpDepositTerms(cctpDepositConfig);
					if (freshFastAllowanceRaw < amountRaw) {
						throw new LocalizedActionError(
							msg`Circle Fast Transfer capacity is temporarily unavailable. Try again later.`,
						);
					}
					if (calculateCctpDepositFee(amountRaw, freshFeeQuote).maxFeeRaw !== parameters.depositForBurn.maxFee) {
						throw new LocalizedActionError(
							msg`Circle fees changed before submission. Review the updated fee and retry.`,
						);
					}
					await assertFreshSelectedDepositRoute();
					let sourceHash: Hash;
					if (mode === "smart") {
						const sponsoredParameters = parameters as ReturnType<typeof createCctpSponsoredDepositParameters>;
						cctpAuthorizationNonce = sponsoredParameters.authorization.authNonce;
						sponsoredAuthorizationValidBefore = sponsoredParameters.authorization.authValidBefore;
						const data = encodeFunctionData({
							abi: CCTP_EXTENSION_V2_ABI,
							functionName: "batchSponsorDepositForBurn",
							args: buildCctpSponsoredDepositContractArgs(sponsoredParameters, authorizationSignature),
						});
						if (!smartClient) throw new LocalizedActionError(msg`Smart wallet client not ready`);
						await assertFreshSelectedDepositRoute();
						await assertReviewedBalanceUnchanged();
						await verifyFreshLegalAction({ env: cctpTrackingEnv });
						await assertProviderAccountStillActive(ready.provider, ready.address);
						if (getClientChainId(smartClient) !== cctpDepositConfig.chainId || !smartClient.paymaster) {
							throw new LocalizedActionError(msg`Smart wallet client not ready`);
						}
						saveCctpSponsoredAuthorizationIntent({
							env: cctpTrackingEnv,
							owner: ready.address,
							authNonce: cctpAuthorizationNonce,
							amount: formatUnits(amountRaw, USDC_DECIMALS),
							validBefore: sponsoredAuthorizationValidBefore,
						});
						sponsoredSubmissionStarted = true;
						sourceHash = (await waitForWalletTransactionHash(
							smartClient.sendTransaction(
								{ to: cctpDepositConfig.cctpExtensionV2, data, value: 0n },
								{ uiOptions: { showWalletUIs: false } },
							),
							DEPOSIT_WALLET_RESPONSE_TIMEOUT_MS,
							markWalletResponseDelayed,
						)) as Hash;
					} else {
						const directParameters = parameters as ReturnType<typeof createCctpDepositParameters>;
						const contractArgs = buildCctpDepositContractArgs(directParameters, authorizationSignature);
						const gas = await ready.publicClient.estimateContractGas({
							account: ready.address,
							address: cctpDepositConfig.cctpExtension,
							abi: CCTP_EXTENSION_ABI,
							functionName: "batchDepositForBurnWithAuth",
							args: contractArgs,
						});
						const [gasPrice, gasBalance] = await Promise.all([
							ready.publicClient.getGasPrice(),
							ready.publicClient.getBalance({ address: ready.address }),
						]);
						const bufferedGas = (gas * GAS_BUFFER_NUMERATOR + GAS_BUFFER_DENOMINATOR - 1n) / GAS_BUFFER_DENOMINATOR;
						if (gasBalance < bufferedGas * gasPrice) {
							throw new LocalizedActionError(
								msg`Add a small amount of Arbitrum ETH to this wallet to pay network fees, then retry.`,
							);
						}
						await assertFreshSelectedDepositRoute();
						await verifyFreshLegalAction({ env: cctpTrackingEnv });
						await assertProviderAccountStillActive(ready.provider, ready.address);
						await assertDepositChainStillActive(ready.provider, cctpDepositConfig);
						sourceHash = await waitForWalletTransactionHash(
							ready.walletClient.writeContract({
								account: ready.address,
								chain: depositChain,
								address: cctpDepositConfig.cctpExtension,
								abi: CCTP_EXTENSION_ABI,
								functionName: "batchDepositForBurnWithAuth",
								args: contractArgs,
							}),
							DEPOSIT_WALLET_RESPONSE_TIMEOUT_MS,
							markWalletResponseDelayed,
						);
					}
					cctpTrackingRecord = { env: cctpTrackingEnv, owner: ready.address, sourceHash };
					try {
						const trackingAmount = formatUnits(amountRaw, USDC_DECIMALS);
						if (mode === "smart") {
							if (!cctpAuthorizationNonce || !sponsoredAuthorizationValidBefore) {
								throw new LocalizedActionError(msg`Unable to verify the CCTP authorization.`);
							}
							saveCctpDepositTrackingRecord({
								...cctpTrackingRecord,
								amount: trackingAmount,
								mode: "sponsored",
								authNonce: cctpAuthorizationNonce,
							});
						} else {
							saveCctpDepositTrackingRecord({
								...cctpTrackingRecord,
								amount: trackingAmount,
								mode: "direct",
							});
						}
					} catch {
						cctpRecoveryUnavailable = true;
					}
					return sourceHash;
				});

				if (
					!updateDepositExecutionState(executionKey, operationId, {
						status: "confirming",
						error: null,
						hash,
						amount,
						route: depositRoute,
						cctpRecoveryUnavailable,
						submissionOutcomeUnknown: false,
						walletResponseDelayed: false,
					})
				) {
					return;
				}
				if (!publicClient) throw new LocalizedActionError(msg`No response from exchange`);
				await waitForBroadcastedTransaction(publicClient, hash, { provider });

				if (!isCurrentDepositExecution(executionKey, operationId)) return;
				const receipt = await waitForConfirmedReceipt(publicClient, hash, { provider });
				if (!cctpDepositUser || !isAddress(cctpDepositUser)) throw new LocalizedActionError(msg`Wallet not connected`);
				if (mode === "smart") {
					if (!cctpAuthorizationNonce) throw new LocalizedActionError(msg`Unable to verify the CCTP authorization.`);
					try {
						assertCctpSponsoredDepositReceipt({
							amountRaw,
							authNonce: cctpAuthorizationNonce,
							config: cctpDepositConfig,
							receipt,
							user: cctpDepositUser,
						});
						try {
							removeCctpSponsoredAuthorizationIntent(cctpTrackingEnv, cctpDepositUser, cctpAuthorizationNonce);
						} catch {
							// The authorization is already consumed. Leave an expiring tombstone if local storage cannot be updated.
						}
					} catch (cause) {
						throw new DefinitiveDepositSourceFailureError("source-receipt-mismatch", toError(cause).message, { cause });
					}
				} else {
					try {
						assertCctpDepositReceipt({
							amountRaw,
							config: cctpDepositConfig,
							receipt,
							user: cctpDepositUser,
						});
					} catch (cause) {
						throw new DefinitiveDepositSourceFailureError("source-receipt-mismatch", toError(cause).message, { cause });
					}
				}

				if (
					!updateDepositExecutionState(executionKey, operationId, (previous) => ({
						...previous,
						status: "success",
						error: null,
						hash,
						amount,
						route: depositRoute,
						submissionOutcomeUnknown: false,
						walletResponseDelayed: false,
					}))
				) {
					return;
				}
				refetch();
			} catch (error) {
				if (cctpTrackingRecord && isDefinitiveDepositSourceFailure(error)) {
					try {
						removeCctpDepositTrackingRecord(
							cctpTrackingRecord.env,
							cctpTrackingRecord.owner,
							cctpTrackingRecord.sourceHash,
						);
					} catch {
						// The modal retries cleanup when the user acknowledges the definitive source-chain failure.
					}
				}
				updateDepositExecutionState(executionKey, operationId, (previous) => ({
					...previous,
					status: "error",
					error: toError(error),
					submissionOutcomeUnknown: sponsoredSubmissionStarted && !previous.hash,
					walletResponseDelayed: false,
				}));
			} finally {
				finishDepositExecution(executionKey, executionLockKey, operationId);
			}
		},
		[
			assertFreshSelectedDepositRoute,
			cctpDepositConfig,
			depositChain,
			depositRoute,
			depositWallet,
			executionKey,
			executionLockKey,
			executionScope,
			getClientForChain,
			expectedCctpMaxFeeRaw,
			mode,
			network,
			publicClient,
			refetch,
			refreshGeoRestriction,
			verifyFreshLegalAction,
			walletAddress,
		],
	);

	const reset = useCallback(() => {
		resetDepositExecution(executionKey);
	}, [executionKey]);

	return {
		...chain,
		networkName: cctpDepositConfig.displayName,
		sponsoredCctpEnabled,
		sponsoredCctpReadiness,
		depositRoute,
		balance,
		balanceRaw,
		maxAmount,
		maxDepositRaw,
		balanceStatus,
		balanceError,
		status: state.status,
		error: state.error,
		hash: state.hash,
		executionAmount: state.amount,
		executionRoute: state.route,
		cctpRecoveryUnavailable: state.cctpRecoveryUnavailable,
		submissionOutcomeUnknown: state.submissionOutcomeUnknown,
		walletResponseDelayed: state.walletResponseDelayed,
		deposit,
		refreshBalance: refetch,
		validate,
		reset,
	};
}
