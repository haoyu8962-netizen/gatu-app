import { t } from "@lingui/core/macro";
import { type ConnectedWallet, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Account, Chain, Hash, Hex, PublicClient, Transport, WalletClient } from "viem";
import { createWalletClient, custom, encodeFunctionData, erc20Abi, formatUnits, parseUnits } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { useChainId, usePublicClient } from "wagmi";
import { BRIDGE2_ABI, DEPOSIT_NETWORKS, MIN_DEPOSIT_USDC, USDC_DECIMALS } from "@/config/contracts";
import {
	DEPOSIT_BROADCAST_TIMEOUT_MS,
	DEPOSIT_CONFIRMATION_TIMEOUT_MS,
	DEPOSIT_POLL_INTERVAL_MS,
	DEPOSIT_WALLET_RESPONSE_TIMEOUT_MS,
} from "@/config/time";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { hasSameWalletAddress } from "@/lib/wallet/privy-wagmi";
import { useIsTestnet } from "@/stores/use-global-settings-store";

export type DepositStatus = "idle" | "pending" | "confirming" | "success" | "error";
type BalanceStatus = "idle" | "loading" | "success" | "error";
type DepositMode = "wallet" | "smart";
type DepositNetwork = keyof typeof DEPOSIT_NETWORKS;
type DepositNetworkConfig = (typeof DEPOSIT_NETWORKS)[DepositNetwork];

interface ValidationResult {
	valid: boolean;
	error: string | null;
}

export interface UseDepositResult {
	isArbitrum: boolean;
	switchToArbitrum: () => void;
	isSwitching: boolean;
	switchError: Error | null;
	networkName: string;
	smartDepositEnabled: boolean;
	balance: string;
	balanceRaw: bigint | undefined;
	maxAmount: string;
	maxDepositRaw: bigint | undefined;
	balanceStatus: BalanceStatus;
	balanceError: Error | null;
	status: DepositStatus;
	error: Error | null;
	hash: Hash | undefined;
	deposit: (amount: string) => void;
	validate: (amount: string) => ValidationResult;
	reset: () => void;
}

interface UseDepositOptions {
	balanceEnabled?: boolean;
	balancePollIntervalMs?: number;
	mode?: DepositMode;
	walletAddress?: `0x${string}`;
}

interface DepositState {
	status: DepositStatus;
	error: Error | null;
	hash: Hash | undefined;
}

interface UsdcBalanceState {
	status: BalanceStatus;
	raw: bigint | undefined;
	error: Error | null;
}

interface ArbitrumSwitchState {
	key: string;
	confirmedChainId: number | null;
	error: Error | null;
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
}

interface ProviderRpcErrorLike {
	code?: number;
	message?: string;
}

const BALANCE_OF_SELECTOR = "0x70a08231";
const PERMIT_DEADLINE_SECONDS = 20 * 60;
const DEPOSIT_CHAINS = {
	mainnet: arbitrum,
	testnet: arbitrumSepolia,
} as const;
const USDC_PERMIT_ABI = [
	...erc20Abi,
	{
		type: "function",
		name: "nonces",
		stateMutability: "view",
		inputs: [{ name: "owner", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
] as const;

function getDepositNetwork(isTestnet: boolean): DepositNetwork {
	return isTestnet ? "testnet" : "mainnet";
}

function getDepositConfig(network: DepositNetwork): DepositNetworkConfig {
	return DEPOSIT_NETWORKS[network];
}

function getDepositChain(network: DepositNetwork): Chain {
	return DEPOSIT_CHAINS[network];
}

function validateAmount(amount: string, maxDepositRaw: bigint | undefined): ValidationResult {
	const trimmed = amount.trim();
	if (!trimmed) return { valid: false, error: null };
	if (maxDepositRaw === undefined) return { valid: false, error: null };

	try {
		const raw = parseUnits(trimmed, USDC_DECIMALS);
		if (raw === 0n) return { valid: false, error: null };
		if (raw < MIN_DEPOSIT_USDC) return { valid: false, error: t`Minimum deposit is 5 USDC` };
		if (raw > maxDepositRaw) return { valid: false, error: t`Insufficient balance` };
		return { valid: true, error: null };
	} catch {
		return { valid: false, error: t`Invalid amount` };
	}
}

function createIdleState(): DepositState {
	return { status: "idle", error: null, hash: undefined };
}

function createArbitrumSwitchState(key = ""): ArbitrumSwitchState {
	return { key, confirmedChainId: null, error: null };
}

function createIdleBalanceState(): UsdcBalanceState {
	return { status: "idle", raw: undefined, error: null };
}

function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(typeof error === "string" ? error : t`Unknown error`);
}

function toBigInt(value: unknown): bigint {
	if (typeof value === "bigint") return value;
	if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
	if (typeof value === "string") return BigInt(value);
	throw new Error(t`Unable to prepare USDC permit`);
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

function createWalletConnectionError(error: unknown): Error {
	const message = getProviderErrorMessage(error);
	if (isUserRejectedRequest(error)) return new Error(t`Wallet connection request was rejected.`);
	if (/unlock/i.test(message)) return new Error(t`Unlock your wallet and try again.`);
	if (/failed to connect|not connected|disconnected|restore|session/i.test(message)) {
		return new Error(t`Wallet connection failed. Unlock your wallet, approve the connection, then retry.`);
	}
	return new Error(message || t`Wallet connection failed. Unlock your wallet, approve the connection, then retry.`);
}

function createChainSwitchError(config: DepositNetworkConfig, error: unknown): Error {
	if (isUserRejectedRequest(error)) return new Error(t`Arbitrum network switch was rejected.`);
	return new Error(t`Unable to switch wallet to ${config.chainName}. Switch networks in your wallet and retry.`);
}

function sleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function toChainHex(chainId: number): `0x${string}` {
	return `0x${chainId.toString(16)}` as const;
}

function encodeBalanceOf(address: `0x${string}`): `0x${string}` {
	return `${BALANCE_OF_SELECTOR}${address.slice(2).padStart(64, "0")}` as `0x${string}`;
}

async function readDepositUsdcBalance(
	config: DepositNetworkConfig,
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

	if (!response.ok) throw new Error(t`Unable to load Arbitrum USDC balance`);

	const payload = (await response.json()) as { result?: string; error?: { message?: string } };
	if (payload.error) throw new Error(payload.error.message || t`Unable to load Arbitrum USDC balance`);
	if (!payload.result) throw new Error(t`Unable to load Arbitrum USDC balance`);
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
): ConnectedWallet | undefined {
	if (!address) return undefined;
	return wallets.find((wallet) => hasSameWalletAddress(wallet.address, address));
}

async function getDepositProvider(wallet: ConnectedWallet): Promise<Eip1193Provider> {
	try {
		return (await wallet.getEthereumProvider()) as Eip1193Provider;
	} catch (error) {
		throw createWalletConnectionError(error);
	}
}

function assertConnectedAccount(accounts: unknown, address: `0x${string}`) {
	if (!Array.isArray(accounts)) {
		throw new Error(t`Wallet connection failed. Unlock your wallet, approve the connection, then retry.`);
	}
	if (!accounts.some((account) => typeof account === "string" && hasSameWalletAddress(account, address))) {
		throw new Error(t`Selected wallet does not match the connected account. Reconnect your wallet and try again.`);
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

async function getProviderChainId(provider: Eip1193Provider): Promise<string> {
	try {
		const chainId = await provider.request({ method: "eth_chainId" });
		return typeof chainId === "string" ? chainId.toLowerCase() : "";
	} catch (error) {
		throw createWalletConnectionError(error);
	}
}

function getAddChainParams(config: DepositNetworkConfig) {
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

async function requestDepositChainSwitch(provider: Eip1193Provider, config: DepositNetworkConfig) {
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

async function ensureDepositChain(provider: Eip1193Provider, config: DepositNetworkConfig) {
	const chainId = toChainHex(config.chainId);
	const currentChainId = await getProviderChainId(provider);
	if (currentChainId !== chainId) {
		await requestDepositChainSwitch(provider, config);
	}

	const nextChainId = await getProviderChainId(provider);
	if (nextChainId !== chainId) {
		throw new Error(t`Wallet is not connected to ${config.chainName}. Switch networks in your wallet and retry.`);
	}
}

export function waitForWalletTransactionHash<T>(
	promise: Promise<T>,
	timeoutMs = DEPOSIT_WALLET_RESPONSE_TIMEOUT_MS,
): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(
				new Error(
					t`Wallet did not return a transaction hash. Check your wallet activity before retrying to avoid sending the deposit twice.`,
				),
			);
		}, timeoutMs);
	});

	return Promise.race([promise, timeout]).finally(() => {
		if (timeoutId) clearTimeout(timeoutId);
	});
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
	config: DepositNetworkConfig;
	publicClient: PublicClient | undefined;
	wallet: ConnectedWallet | undefined;
}): Promise<ReadyDepositContext> {
	if (!address) throw new Error(t`Wallet not connected`);
	if (!publicClient) throw new Error(t`No response from exchange`);
	if (!wallet) throw new Error(t`Wallet client not ready`);
	if (!hasSameWalletAddress(wallet.address, address)) {
		throw new Error(t`Selected wallet does not match the connected account. Reconnect your wallet and try again.`);
	}

	const provider = await getDepositProvider(wallet);
	await ensureProviderAccount(provider, address);
	if (getWalletChainId(wallet) !== config.chainId) {
		await ensureDepositChain(provider, config);
	} else {
		const providerChainId = await getProviderChainId(provider);
		if (providerChainId !== toChainHex(config.chainId)) await ensureDepositChain(provider, config);
	}

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
	if (!address) throw new Error(t`Wallet not connected`);
	if (!publicClient) throw new Error(t`No response from exchange`);
	if (!wallet) throw new Error(t`Wallet client not ready`);
	if (!hasSameWalletAddress(wallet.address, address)) {
		throw new Error(t`Selected wallet does not match the connected account. Reconnect your wallet and try again.`);
	}

	const provider = await getDepositProvider(wallet);
	await ensureProviderAccount(provider, address);

	const walletClient = createWalletClient({
		account: address,
		chain,
		transport: custom(provider),
	});

	return { address, provider, publicClient, walletClient: walletClient as ReadyWalletClient };
}

function splitPermitSignature(signature: Hex) {
	const normalized = signature.slice(2);
	if (normalized.length !== 130) throw new Error(t`Unable to prepare USDC permit`);
	let v = Number.parseInt(normalized.slice(128, 130), 16);
	if (v < 27) v += 27;

	return {
		r: BigInt(`0x${normalized.slice(0, 64)}`),
		s: BigInt(`0x${normalized.slice(64, 128)}`),
		v,
	};
}

async function createBridge2PermitCall({
	amountRaw,
	config,
	context,
}: {
	amountRaw: bigint;
	config: DepositNetworkConfig;
	context: ReadyDepositContext;
}): Promise<Hex> {
	const nonce = toBigInt(
		await context.publicClient.readContract({
			address: config.usdc,
			abi: USDC_PERMIT_ABI,
			functionName: "nonces",
			args: [context.address],
		}),
	);
	const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS);
	const permitSignature = await context.walletClient.signTypedData({
		account: context.address,
		domain: {
			name: config.usdcPermitName,
			version: config.usdcPermitVersion,
			chainId: config.chainId,
			verifyingContract: config.usdc,
		},
		types: {
			Permit: [
				{ name: "owner", type: "address" },
				{ name: "spender", type: "address" },
				{ name: "value", type: "uint256" },
				{ name: "nonce", type: "uint256" },
				{ name: "deadline", type: "uint256" },
			],
		},
		primaryType: "Permit",
		message: {
			owner: context.address,
			spender: config.bridge2,
			value: amountRaw,
			nonce,
			deadline,
		},
	});

	return encodeFunctionData({
		abi: BRIDGE2_ABI,
		functionName: "batchedDepositWithPermit",
		args: [
			[
				{
					user: context.address,
					usd: amountRaw,
					deadline,
					signature: splitPermitSignature(permitSignature),
				},
			],
		],
	});
}

async function providerHasTransaction(provider: Eip1193Provider | undefined, hash: Hash) {
	if (!provider) return false;

	try {
		const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [hash] });
		if (receipt) return true;
	} catch {}

	try {
		const transaction = await provider.request({ method: "eth_getTransactionByHash", params: [hash] });
		return !!transaction;
	} catch {
		return false;
	}
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
		if (await providerHasTransaction(options.provider, hash)) return;

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

	throw new Error(
		t`Wallet returned a transaction hash, but it is not visible on Arbitrum yet. Check your wallet activity or Arbiscan before retrying to avoid sending the deposit twice.`,
	);
}

async function waitForConfirmedReceipt(publicClient: PublicClient, hash: Hash) {
	try {
		const receipt = await publicClient.waitForTransactionReceipt({
			hash,
			pollingInterval: DEPOSIT_POLL_INTERVAL_MS,
			timeout: DEPOSIT_CONFIRMATION_TIMEOUT_MS,
		});

		if (receipt.status === "reverted") {
			throw new Error(t`Transaction reverted on Arbitrum`);
		}

		return receipt;
	} catch (error) {
		if (/timed out|timeout/i.test(toError(error).message)) {
			let transaction: Awaited<ReturnType<PublicClient["getTransaction"]>> | null = null;
			try {
				transaction = await publicClient.getTransaction({ hash });
			} catch {}

			if (transaction && transaction.blockNumber === null) {
				throw new Error(
					t`Deposit transaction was submitted but did not confirm on Arbitrum. Your wallet nonce may be out of sync with the network. Clear pending activity or reset nonce data in your wallet, then retry.`,
				);
			}

			throw new Error(t`Deposit transaction was broadcast but confirmation timed out. Check Arbiscan before retrying.`);
		}

		throw error;
	}
}

function useDepositChain(
	wallet: ConnectedWallet | undefined,
	address: `0x${string}` | undefined,
	config: DepositNetworkConfig,
	enabled: boolean,
) {
	const chainId = useChainId();
	const walletKey = `${address ?? ""}:${wallet?.address ?? ""}:${wallet?.chainId ?? ""}:${config.chainId}`;
	const [switchState, setSwitchState] = useState<ArbitrumSwitchState>(createArbitrumSwitchState);
	const [isSwitching, setIsSwitching] = useState(false);

	const switchToArbitrum = useCallback(() => {
		if (!enabled) return;
		if (!address || !wallet) {
			setSwitchState({ ...createArbitrumSwitchState(walletKey), error: new Error(t`Wallet not connected`) });
			return;
		}

		setIsSwitching(true);
		setSwitchState(createArbitrumSwitchState(walletKey));
		void (async () => {
			const provider = await getDepositProvider(wallet);
			await ensureProviderAccount(provider, address);
			await ensureDepositChain(provider, config);
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
		};
	}

	const walletChainId = wallet ? getWalletChainId(wallet) : null;
	const confirmedChainId = switchState.key === walletKey ? switchState.confirmedChainId : null;
	const effectiveChainId = confirmedChainId ?? walletChainId ?? chainId;

	return {
		isArbitrum: effectiveChainId === config.chainId,
		switchToArbitrum,
		isSwitching,
		switchError: switchState.key === walletKey ? switchState.error : null,
	};
}

function useDepositUsdcBalance(
	config: DepositNetworkConfig,
	address: `0x${string}` | undefined,
	enabled: boolean,
	pollIntervalMs?: number,
) {
	const [state, setState] = useState<UsdcBalanceState>(createIdleBalanceState);
	const requestIdRef = useRef(0);

	const refetch = useCallback(async () => {
		if (!enabled || !address) {
			setState(createIdleBalanceState());
			return;
		}

		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;
		const abortController = new AbortController();

		setState((previous) => ({ status: "loading", raw: previous.raw, error: null }));

		try {
			const raw = await readDepositUsdcBalance(config, address, abortController.signal);
			if (requestIdRef.current !== requestId) return;
			setState({ status: "success", raw, error: null });
		} catch (error) {
			if (abortController.signal.aborted || requestIdRef.current !== requestId) return;
			setState((previous) => ({ status: "error", raw: previous.raw, error: toError(error) }));
		}
	}, [address, config, enabled]);

	useEffect(() => {
		if (!enabled || !address) {
			requestIdRef.current += 1;
			setState(createIdleBalanceState());
			return;
		}

		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;
		const abortController = new AbortController();

		setState({ status: "loading", raw: undefined, error: null });

		void readDepositUsdcBalance(config, address, abortController.signal)
			.then((raw) => {
				if (requestIdRef.current !== requestId) return;
				setState({ status: "success", raw, error: null });
			})
			.catch((error) => {
				if (abortController.signal.aborted || requestIdRef.current !== requestId) return;
				setState({ status: "error", raw: undefined, error: toError(error) });
			});

		return () => {
			abortController.abort();
		};
	}, [address, config, enabled]);

	useEffect(() => {
		if (!enabled || !address || !pollIntervalMs) return;

		const interval = window.setInterval(() => {
			void refetch();
		}, pollIntervalMs);

		return () => window.clearInterval(interval);
	}, [address, enabled, pollIntervalMs, refetch]);

	const balance = useMemo(() => (state.raw !== undefined ? formatUnits(state.raw, USDC_DECIMALS) : "0"), [state.raw]);
	const maxDepositRaw = state.raw;
	const maxAmount = useMemo(
		() => (maxDepositRaw !== undefined ? formatUnits(maxDepositRaw, USDC_DECIMALS) : "0"),
		[maxDepositRaw],
	);

	return {
		balanceRaw: state.raw,
		maxDepositRaw,
		balance,
		maxAmount,
		status: state.status,
		error: state.error,
		refetch,
	};
}

export function useDeposit({
	balanceEnabled = true,
	balancePollIntervalMs,
	mode = "wallet",
	walletAddress: walletAddressOverride,
}: UseDepositOptions = {}): UseDepositResult {
	const network = getDepositNetwork(useIsTestnet());
	const depositConfig = getDepositConfig(network);
	const depositChain = getDepositChain(network);
	const { walletAddress: sessionWalletAddress } = useWalletSession();
	const walletAddress = walletAddressOverride ?? sessionWalletAddress;
	const { wallets } = useWallets();
	const { getClientForChain } = useSmartWallets();
	const depositWallet = useMemo(() => selectDepositWallet(wallets, walletAddress), [wallets, walletAddress]);
	const chain = useDepositChain(depositWallet, walletAddress, depositConfig, mode === "wallet");
	const {
		balanceRaw,
		maxDepositRaw,
		balance,
		maxAmount,
		status: balanceStatus,
		error: balanceError,
		refetch,
	} = useDepositUsdcBalance(depositConfig, walletAddress, balanceEnabled && !!walletAddress, balancePollIntervalMs);
	const publicClient = usePublicClient({ chainId: depositConfig.chainId });

	const [state, setState] = useState<DepositState>(createIdleState);
	const operationIdRef = useRef(0);
	const inFlightRef = useRef(false);

	const validate = useCallback((amount: string) => validateAmount(amount, maxDepositRaw), [maxDepositRaw]);

	const deposit = useCallback(
		async (amount: string) => {
			if (inFlightRef.current) return;
			const operationId = operationIdRef.current + 1;
			operationIdRef.current = operationId;
			inFlightRef.current = true;
			setState({ status: "pending", error: null, hash: undefined });

			try {
				const amountRaw = parseUnits(amount, USDC_DECIMALS);
				let hash: Hash;
				let provider: Eip1193Provider | undefined;

				if (mode === "smart") {
					if (!depositConfig.smartDepositEnabled) {
						throw new Error(t`Smart wallet deposits are not enabled for this network.`);
					}

					const ready = await getReadyPermitSignerContext({
						address: walletAddress,
						chain: depositChain,
						publicClient,
						wallet: depositWallet,
					});
					const data = await createBridge2PermitCall({
						amountRaw,
						config: depositConfig,
						context: ready,
					});
					const smartClient = await getClientForChain({ id: depositConfig.chainId });
					if (!smartClient) throw new Error(t`Smart wallet client not ready`);

					hash = (await waitForWalletTransactionHash(
						smartClient.sendTransaction(
							{
								to: depositConfig.bridge2,
								data,
								value: 0n,
							},
							{ uiOptions: { showWalletUIs: false } },
						),
					)) as Hash;
				} else {
					const ready = await getReadyWalletDepositContext({
						address: walletAddress,
						chain: depositChain,
						config: depositConfig,
						publicClient,
						wallet: depositWallet,
					});
					provider = ready.provider;
					hash = await waitForWalletTransactionHash(
						ready.walletClient.writeContract({
							account: ready.address,
							chain: depositChain,
							address: depositConfig.usdc,
							abi: erc20Abi,
							functionName: "transfer",
							args: [depositConfig.bridge2, amountRaw],
						}),
					);
				}

				if (operationIdRef.current !== operationId) return;
				setState({ status: "confirming", error: null, hash });
				if (!publicClient) throw new Error(t`No response from exchange`);
				await waitForBroadcastedTransaction(publicClient, hash, { provider });

				if (operationIdRef.current !== operationId) return;
				await waitForConfirmedReceipt(publicClient, hash);

				if (operationIdRef.current !== operationId) return;
				setState({ status: "success", error: null, hash });
				refetch();
			} catch (error) {
				if (operationIdRef.current !== operationId) return;
				setState((previous) => ({ status: "error", error: toError(error), hash: previous.hash }));
			} finally {
				if (operationIdRef.current === operationId) {
					inFlightRef.current = false;
				}
			}
		},
		[depositChain, depositConfig, depositWallet, getClientForChain, mode, publicClient, refetch, walletAddress],
	);

	const reset = useCallback(() => {
		operationIdRef.current += 1;
		inFlightRef.current = false;
		setState(createIdleState());
	}, []);

	return {
		...chain,
		networkName: depositConfig.displayName,
		smartDepositEnabled: depositConfig.smartDepositEnabled,
		balance,
		balanceRaw,
		maxAmount,
		maxDepositRaw,
		balanceStatus,
		balanceError,
		status: state.status,
		error: state.error,
		hash: state.hash,
		deposit,
		validate,
		reset,
	};
}
