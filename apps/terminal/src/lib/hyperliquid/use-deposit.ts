import { t } from "@lingui/core/macro";
import { type ConnectedWallet, useWallets } from "@privy-io/react-auth";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Account, Hash, PublicClient, Transport, WalletClient } from "viem";
import { createWalletClient, custom, erc20Abi, formatUnits, parseUnits } from "viem";
import { arbitrum } from "viem/chains";
import { useChainId, usePublicClient, useReadContract, useSwitchChain } from "wagmi";
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

type ReadyWalletClient = WalletClient<Transport, typeof arbitrum, Account>;

interface ReadyDepositContext {
	address: `0x${string}`;
	publicClient: PublicClient;
	walletClient: ReadyWalletClient;
}

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

function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(typeof error === "string" ? error : t`Unknown error`);
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

	if (getWalletChainId(wallet) !== ARBITRUM_CHAIN_ID) {
		await wallet.switchChain(ARBITRUM_CHAIN_ID);
	}

	const provider = await wallet.getEthereumProvider();
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

function useArbitrumChain() {
	const chainId = useChainId();
	const { mutate, isPending, error } = useSwitchChain();

	const switchToArbitrum = useCallback(() => mutate({ chainId: ARBITRUM_CHAIN_ID }), [mutate]);

	return {
		isArbitrum: chainId === ARBITRUM_CHAIN_ID,
		switchToArbitrum,
		isSwitching: isPending,
		switchError: error,
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
	const chain = useArbitrumChain();
	const { wallets } = useWallets();
	const depositWallet = useMemo(() => selectDepositWallet(wallets, walletAddress), [wallets, walletAddress]);
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
