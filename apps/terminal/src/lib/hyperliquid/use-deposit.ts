import { t } from "@lingui/core/macro";
import { type ConnectedWallet, useWallets } from "@privy-io/react-auth";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Account, Hash, PublicClient, Transport, WalletClient } from "viem";
import { createWalletClient, custom, erc20Abi, formatUnits, parseUnits } from "viem";
import { arbitrum } from "viem/chains";
import { useChainId, usePublicClient, useReadContract } from "wagmi";
import { ARBITRUM_CHAIN_ID, CONTRACTS, MIN_DEPOSIT_USDC, USDC_DECIMALS } from "@/config/contracts";
import {
	DEPOSIT_BROADCAST_TIMEOUT_MS,
	DEPOSIT_CONFIRMATION_TIMEOUT_MS,
	DEPOSIT_POLL_INTERVAL_MS,
	DEPOSIT_WALLET_RESPONSE_TIMEOUT_MS,
} from "@/config/time";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { hasSameWalletAddress } from "@/lib/wallet/privy-wagmi";

export type DepositStatus = "idle" | "pending" | "confirming" | "success" | "error";

interface ValidationResult {
	valid: boolean;
	error: string | null;
}

export interface UseDepositResult {
	isArbitrum: boolean;
	switchToArbitrum: () => void;
	isSwitching: boolean;
	switchError: Error | null;
	balance: string;
	status: DepositStatus;
	error: Error | null;
	hash: Hash | undefined;
	deposit: (amount: string) => void;
	validate: (amount: string) => ValidationResult;
	reset: () => void;
}

interface DepositState {
	status: DepositStatus;
	error: Error | null;
	hash: Hash | undefined;
}

interface ArbitrumSwitchState {
	key: string;
	confirmedChainId: number | null;
	error: Error | null;
}

type ReadyWalletClient = WalletClient<Transport, typeof arbitrum, Account>;

interface ReadyDepositContext {
	address: `0x${string}`;
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

const ARBITRUM_CHAIN_ID_HEX = `0x${ARBITRUM_CHAIN_ID.toString(16)}` as const;
const ARBITRUM_ADD_CHAIN_PARAMS = {
	chainId: ARBITRUM_CHAIN_ID_HEX,
	chainName: "Arbitrum One",
	nativeCurrency: {
		name: "Ether",
		symbol: "ETH",
		decimals: 18,
	},
	rpcUrls: ["https://arb1.arbitrum.io/rpc"],
	blockExplorerUrls: ["https://arbiscan.io"],
} as const;

function validateAmount(amount: string, balanceRaw: bigint | undefined): ValidationResult {
	const trimmed = amount.trim();
	if (!trimmed) return { valid: false, error: null };

	try {
		const raw = parseUnits(trimmed, USDC_DECIMALS);
		if (raw === 0n) return { valid: false, error: null };
		if (raw < MIN_DEPOSIT_USDC) return { valid: false, error: t`Minimum deposit is 5 USDC` };
		if (balanceRaw !== undefined && raw > balanceRaw) return { valid: false, error: t`Insufficient balance` };
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

function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(typeof error === "string" ? error : t`Unknown error`);
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

function createChainSwitchError(error: unknown): Error {
	if (isUserRejectedRequest(error)) return new Error(t`Arbitrum network switch was rejected.`);
	return new Error(t`Unable to switch wallet to Arbitrum. Switch networks in your wallet and retry.`);
}

function sleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
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

async function requestArbitrumSwitch(provider: Eip1193Provider) {
	try {
		await provider.request({
			method: "wallet_switchEthereumChain",
			params: [{ chainId: ARBITRUM_CHAIN_ID_HEX }],
		});
	} catch (error) {
		if (!isUnknownChainError(error)) throw createChainSwitchError(error);

		try {
			await provider.request({
				method: "wallet_addEthereumChain",
				params: [ARBITRUM_ADD_CHAIN_PARAMS],
			});
		} catch (addError) {
			throw createChainSwitchError(addError);
		}

		try {
			await provider.request({
				method: "wallet_switchEthereumChain",
				params: [{ chainId: ARBITRUM_CHAIN_ID_HEX }],
			});
		} catch (switchError) {
			throw createChainSwitchError(switchError);
		}
	}
}

async function ensureArbitrumChain(provider: Eip1193Provider) {
	const chainId = await getProviderChainId(provider);
	if (chainId !== ARBITRUM_CHAIN_ID_HEX) {
		await requestArbitrumSwitch(provider);
	}

	const nextChainId = await getProviderChainId(provider);
	if (nextChainId !== ARBITRUM_CHAIN_ID_HEX) {
		throw new Error(t`Wallet is not connected to Arbitrum. Switch networks in your wallet and retry.`);
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

async function getReadyDepositContext({
	address,
	publicClient,
	wallet,
}: {
	address: `0x${string}` | undefined;
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
	if (getWalletChainId(wallet) !== ARBITRUM_CHAIN_ID) {
		await ensureArbitrumChain(provider);
	} else {
		const providerChainId = await getProviderChainId(provider);
		if (providerChainId !== ARBITRUM_CHAIN_ID_HEX) await ensureArbitrumChain(provider);
	}

	const walletClient = createWalletClient({
		account: address,
		chain: arbitrum,
		transport: custom(provider),
	});

	return { address, publicClient, walletClient: walletClient as ReadyWalletClient };
}

export async function waitForBroadcastedTransaction(
	publicClient: PublicClient,
	hash: Hash,
	options: { timeoutMs?: number; pollingIntervalMs?: number } = {},
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

	throw new Error(t`Transaction was not broadcast. Please retry.`);
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

function useArbitrumChain(wallet: ConnectedWallet | undefined, address: `0x${string}` | undefined) {
	const chainId = useChainId();
	const walletKey = `${address ?? ""}:${wallet?.address ?? ""}:${wallet?.chainId ?? ""}`;
	const [switchState, setSwitchState] = useState<ArbitrumSwitchState>(createArbitrumSwitchState);
	const [isSwitching, setIsSwitching] = useState(false);

	const switchToArbitrum = useCallback(() => {
		if (!address || !wallet) {
			setSwitchState({ ...createArbitrumSwitchState(walletKey), error: new Error(t`Wallet not connected`) });
			return;
		}

		setIsSwitching(true);
		setSwitchState(createArbitrumSwitchState(walletKey));
		void (async () => {
			const provider = await getDepositProvider(wallet);
			await ensureProviderAccount(provider, address);
			await ensureArbitrumChain(provider);
			setSwitchState({ key: walletKey, confirmedChainId: ARBITRUM_CHAIN_ID, error: null });
		})()
			.catch((error) => setSwitchState({ ...createArbitrumSwitchState(walletKey), error: toError(error) }))
			.finally(() => setIsSwitching(false));
	}, [address, wallet, walletKey]);

	const walletChainId = wallet ? getWalletChainId(wallet) : null;
	const confirmedChainId = switchState.key === walletKey ? switchState.confirmedChainId : null;
	const effectiveChainId = confirmedChainId ?? walletChainId ?? chainId;

	return {
		isArbitrum: effectiveChainId === ARBITRUM_CHAIN_ID,
		switchToArbitrum,
		isSwitching,
		switchError: switchState.key === walletKey ? switchState.error : null,
	};
}

function useUsdcBalance(address: `0x${string}` | undefined, enabled: boolean) {
	const { data: balanceRaw, refetch } = useReadContract({
		address: CONTRACTS.arbitrum.usdc,
		abi: erc20Abi,
		functionName: "balanceOf",
		args: address ? [address] : undefined,
		chainId: ARBITRUM_CHAIN_ID,
		query: { enabled },
	});

	const balance = useMemo(() => (balanceRaw ? formatUnits(balanceRaw, USDC_DECIMALS) : "0"), [balanceRaw]);

	return { balanceRaw, balance, refetch };
}

export function useDeposit(): UseDepositResult {
	const { walletAddress } = useWalletSession();
	const { wallets } = useWallets();
	const depositWallet = useMemo(() => selectDepositWallet(wallets, walletAddress), [wallets, walletAddress]);
	const chain = useArbitrumChain(depositWallet, walletAddress);
	const { balanceRaw, balance, refetch } = useUsdcBalance(walletAddress, chain.isArbitrum && !!walletAddress);
	const publicClient = usePublicClient({ chainId: ARBITRUM_CHAIN_ID });

	const [state, setState] = useState<DepositState>(createIdleState);
	const operationIdRef = useRef(0);

	const validate = useCallback((amount: string) => validateAmount(amount, balanceRaw), [balanceRaw]);

	const deposit = useCallback(
		async (amount: string) => {
			const operationId = operationIdRef.current + 1;
			operationIdRef.current = operationId;
			setState({ status: "pending", error: null, hash: undefined });

			try {
				const ready = await getReadyDepositContext({ address: walletAddress, publicClient, wallet: depositWallet });

				const hash = await waitForWalletTransactionHash(
					ready.walletClient.writeContract({
						account: ready.address,
						chain: arbitrum,
						address: CONTRACTS.arbitrum.usdc,
						abi: erc20Abi,
						functionName: "transfer",
						args: [CONTRACTS.arbitrum.bridge2, parseUnits(amount, USDC_DECIMALS)],
					}),
				);

				if (operationIdRef.current !== operationId) return;
				setState({ status: "confirming", error: null, hash });
				await waitForBroadcastedTransaction(ready.publicClient, hash);

				if (operationIdRef.current !== operationId) return;
				await waitForConfirmedReceipt(ready.publicClient, hash);

				if (operationIdRef.current !== operationId) return;
				setState({ status: "success", error: null, hash });
				refetch();
			} catch (error) {
				if (operationIdRef.current !== operationId) return;
				setState((previous) => ({ status: "error", error: toError(error), hash: previous.hash }));
			}
		},
		[depositWallet, publicClient, refetch, walletAddress],
	);

	const reset = useCallback(() => {
		operationIdRef.current += 1;
		setState(createIdleState());
	}, []);

	return {
		...chain,
		balance,
		status: state.status,
		error: state.error,
		hash: state.hash,
		deposit,
		validate,
		reset,
	};
}
