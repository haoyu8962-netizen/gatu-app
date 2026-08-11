import { t } from "@lingui/core/macro";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { formatUnits } from "viem";
import { MIN_DEPOSIT_USDC, USDC_DECIMALS } from "@/config/contracts";
import { DEPOSIT_BALANCE_REFRESH_MS } from "@/config/time";
import { getUsdcRoutingQueryStatus } from "@/domain/trade/usdc-routing";
import { useUsdcRouting } from "@/hooks/trade/use-usdc-routing";
import { useEmailEmbeddedWallet } from "@/hooks/wallet/use-email-embedded-wallet";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatTransferError, isSmartWalletNonceConflict } from "@/lib/errors/format";
import { useDeposit } from "@/lib/hyperliquid/use-deposit";
import { runWithExclusiveBrowserLock } from "@/lib/wallet/exclusive-browser-lock";
import { getPrivyEmailAddress, shouldUsePrivyEmbeddedWallet } from "@/lib/wallet/privy-wagmi";

const AUTO_BRIDGE_TOAST_ID = "embedded-deposit-auto-bridge";
const AUTO_BRIDGE_RETRY_DELAY_MS = 30_000;
const AUTO_BRIDGE_MAX_RETRY_DELAY_MS = 5 * 60_000;

export function EmbeddedDepositAutoBridge() {
	const { user, embeddedWalletAddress } = useWalletSession();
	const {
		emailAddress: emailWalletAddress,
		embeddedWalletAddress: ensuredEmbeddedWalletAddress,
		shouldUseEmbeddedWallet: shouldUseEmailEmbeddedWallet,
		needsEmbeddedWallet,
		isCreatingEmbeddedWallet,
		embeddedWalletError,
		ensureEmailEmbeddedWallet,
	} = useEmailEmbeddedWallet();
	const emailAddress = getPrivyEmailAddress(user) ?? emailWalletAddress;
	const depositEmbeddedWalletAddress = embeddedWalletAddress ?? ensuredEmbeddedWalletAddress;
	const isEmbeddedDeposit = !!emailAddress && (shouldUsePrivyEmbeddedWallet(user) || shouldUseEmailEmbeddedWallet);
	const usdcRoutingQuery = useUsdcRouting(isEmbeddedDeposit && !!depositEmbeddedWalletAddress);
	const usdcRoutingStatus = getUsdcRoutingQueryStatus({
		data: usdcRoutingQuery.data,
		isError: usdcRoutingQuery.isError,
		isFetching: usdcRoutingQuery.isFetching,
	});
	const autoBridgeRouteAvailable = !usdcRoutingQuery.isError && usdcRoutingQuery.data?.depositRoute === "bridge";
	const attemptKeyRef = useRef<string | null>(null);
	const lastEligibleKeyRef = useRef<string | null>(null);
	const retryKeyRef = useRef<string | null>(null);
	const retryCountRef = useRef(0);
	const retryTimeoutRef = useRef<number | null>(null);
	const activeAttemptAbortRef = useRef<AbortController | null>(null);
	const activeAttemptIdentityRef = useRef<string | null>(null);
	const reconciledErrorRef = useRef<Error | null>(null);
	const loadingToastActiveRef = useRef(false);

	const {
		maxDepositRaw,
		status: depositStatus,
		error: depositError,
		hash: depositHash,
		deposit,
		refreshBalance,
		reset: resetDeposit,
		networkName,
		smartDepositEnabled,
	} = useDeposit({
		balanceEnabled: isEmbeddedDeposit && !!depositEmbeddedWalletAddress,
		balancePollIntervalMs: DEPOSIT_BALANCE_REFRESH_MS,
		executionScope: "automatic",
		mode: "smart",
		walletAddress: isEmbeddedDeposit ? depositEmbeddedWalletAddress : undefined,
	});

	useEffect(() => {
		if (!isEmbeddedDeposit || !needsEmbeddedWallet || isCreatingEmbeddedWallet) return;
		void ensureEmailEmbeddedWallet().catch(() => {});
	}, [ensureEmailEmbeddedWallet, isCreatingEmbeddedWallet, isEmbeddedDeposit, needsEmbeddedWallet]);

	const balanceEligibleKey =
		isEmbeddedDeposit &&
		smartDepositEnabled &&
		!needsEmbeddedWallet &&
		!isCreatingEmbeddedWallet &&
		!embeddedWalletError &&
		depositEmbeddedWalletAddress &&
		maxDepositRaw !== undefined &&
		maxDepositRaw >= MIN_DEPOSIT_USDC
			? `${networkName}:${depositEmbeddedWalletAddress.toLowerCase()}:${maxDepositRaw.toString()}`
			: null;
	const eligibleDepositKey = balanceEligibleKey && autoBridgeRouteAvailable ? balanceEligibleKey : null;
	const depositIdentityKey = depositEmbeddedWalletAddress
		? `${networkName}:${depositEmbeddedWalletAddress.toLowerCase()}`
		: null;

	useEffect(() => {
		return () => {
			if (retryTimeoutRef.current) window.clearTimeout(retryTimeoutRef.current);
			activeAttemptAbortRef.current?.abort();
			if (loadingToastActiveRef.current) toast.dismiss(AUTO_BRIDGE_TOAST_ID);
		};
	}, []);

	useEffect(() => {
		function scheduleRetry(retryKey: string) {
			if (retryTimeoutRef.current) return;

			retryKeyRef.current = retryKey;
			const retryDelay = Math.min(
				AUTO_BRIDGE_RETRY_DELAY_MS * 2 ** Math.min(retryCountRef.current, 3),
				AUTO_BRIDGE_MAX_RETRY_DELAY_MS,
			);
			retryCountRef.current += 1;
			retryTimeoutRef.current = window.setTimeout(() => {
				retryTimeoutRef.current = null;
				retryKeyRef.current = null;
				attemptKeyRef.current = null;
				resetDeposit();
			}, retryDelay);
		}

		if (activeAttemptIdentityRef.current && activeAttemptIdentityRef.current !== depositIdentityKey) {
			activeAttemptAbortRef.current?.abort();
			activeAttemptAbortRef.current = null;
			activeAttemptIdentityRef.current = null;
		}

		if (lastEligibleKeyRef.current !== eligibleDepositKey) {
			lastEligibleKeyRef.current = eligibleDepositKey;
			retryCountRef.current = 0;
		}

		if (retryTimeoutRef.current && retryKeyRef.current !== eligibleDepositKey) {
			window.clearTimeout(retryTimeoutRef.current);
			retryTimeoutRef.current = null;
			retryKeyRef.current = null;
			retryCountRef.current = 0;
		}

		if (!eligibleDepositKey || maxDepositRaw === undefined) {
			attemptKeyRef.current = null;
			if (retryTimeoutRef.current) {
				window.clearTimeout(retryTimeoutRef.current);
				retryTimeoutRef.current = null;
			}
			retryKeyRef.current = null;
			retryCountRef.current = 0;
			if (depositStatus === "success" || depositStatus === "error") resetDeposit();
			return;
		}

		if (depositStatus === "pending" || depositStatus === "confirming") return;

		if (depositStatus === "success") {
			reconciledErrorRef.current = null;
			if (retryTimeoutRef.current) {
				window.clearTimeout(retryTimeoutRef.current);
				retryTimeoutRef.current = null;
			}
			retryKeyRef.current = null;
			retryCountRef.current = 0;

			if (attemptKeyRef.current !== eligibleDepositKey) {
				attemptKeyRef.current = null;
				resetDeposit();
			}
			return;
		}

		if (depositStatus === "error") {
			if (isSmartWalletNonceConflict(depositError) && reconciledErrorRef.current !== depositError) {
				reconciledErrorRef.current = depositError;
				void refreshBalance();
			}

			if (depositHash) {
				if (retryTimeoutRef.current) {
					window.clearTimeout(retryTimeoutRef.current);
					retryTimeoutRef.current = null;
				}
				retryKeyRef.current = null;
				return;
			}

			if (attemptKeyRef.current !== eligibleDepositKey) {
				attemptKeyRef.current = null;
				resetDeposit();
				return;
			}

			scheduleRetry(eligibleDepositKey);
			return;
		}

		if (attemptKeyRef.current === eligibleDepositKey) return;
		if (!depositEmbeddedWalletAddress) return;

		attemptKeyRef.current = eligibleDepositKey;
		const abortController = new AbortController();
		activeAttemptAbortRef.current = abortController;
		activeAttemptIdentityRef.current = depositIdentityKey;
		const normalizedWalletAddress = depositEmbeddedWalletAddress.toLowerCase();
		const lockName = `gatu:embedded-deposit:${networkName}:${normalizedWalletAddress}`;

		void runWithExclusiveBrowserLock({
			name: lockName,
			signal: abortController.signal,
			task: async () => {
				const currentBalanceRaw = await refreshBalance();
				if (abortController.signal.aborted) return;
				if (currentBalanceRaw === undefined) {
					attemptKeyRef.current = null;
					scheduleRetry(eligibleDepositKey);
					return;
				}
				if (currentBalanceRaw < MIN_DEPOSIT_USDC) {
					return;
				}

				attemptKeyRef.current = `${networkName}:${normalizedWalletAddress}:${currentBalanceRaw.toString()}`;
				await deposit(formatUnits(currentBalanceRaw, USDC_DECIMALS));
			},
		})
			.catch(() => {
				if (abortController.signal.aborted) return;
				attemptKeyRef.current = null;
				scheduleRetry(eligibleDepositKey);
			})
			.finally(() => {
				if (activeAttemptAbortRef.current === abortController) {
					activeAttemptAbortRef.current = null;
					activeAttemptIdentityRef.current = null;
				}
			});
	}, [
		deposit,
		depositEmbeddedWalletAddress,
		depositError,
		depositHash,
		depositStatus,
		depositIdentityKey,
		eligibleDepositKey,
		maxDepositRaw,
		networkName,
		refreshBalance,
		resetDeposit,
	]);

	useEffect(() => {
		if (isEmbeddedDeposit && balanceEligibleKey && usdcRoutingQuery.data?.depositRoute === "cctp") {
			loadingToastActiveRef.current = false;
			toast.error(t`Automatic deposits are paused because Hyperliquid currently requires CCTP deposits.`, {
				id: AUTO_BRIDGE_TOAST_ID,
			});
			return;
		}

		if (isEmbeddedDeposit && balanceEligibleKey && !autoBridgeRouteAvailable) {
			if (usdcRoutingStatus === "loading") {
				loadingToastActiveRef.current = true;
				toast.loading(t`Checking the current Hyperliquid deposit route...`, { id: AUTO_BRIDGE_TOAST_ID });
			} else {
				loadingToastActiveRef.current = false;
				toast.error(t`Unable to verify the current Hyperliquid deposit route. Automatic deposits are paused.`, {
					id: AUTO_BRIDGE_TOAST_ID,
				});
			}
			return;
		}

		if (!isEmbeddedDeposit || depositStatus === "idle") {
			if (loadingToastActiveRef.current) {
				toast.dismiss(AUTO_BRIDGE_TOAST_ID);
				loadingToastActiveRef.current = false;
			}
			return;
		}

		if (depositStatus === "pending") {
			loadingToastActiveRef.current = true;
			toast.loading(t`Preparing automatic USDC deposit...`, { id: AUTO_BRIDGE_TOAST_ID });
			return;
		}

		if (depositStatus === "confirming") {
			loadingToastActiveRef.current = true;
			toast.loading(t`Depositing USDC to Hyperliquid...`, { id: AUTO_BRIDGE_TOAST_ID });
			return;
		}

		if (depositStatus === "success") {
			loadingToastActiveRef.current = false;
			toast.success(t`USDC deposit submitted to Hyperliquid`, { id: AUTO_BRIDGE_TOAST_ID });
			return;
		}

		if (depositStatus === "error") {
			loadingToastActiveRef.current = false;
			toast.error(depositError ? formatTransferError(depositError) : t`Automatic USDC deposit failed`, {
				id: AUTO_BRIDGE_TOAST_ID,
			});
		}
	}, [
		balanceEligibleKey,
		autoBridgeRouteAvailable,
		depositError,
		depositStatus,
		isEmbeddedDeposit,
		usdcRoutingQuery.data?.depositRoute,
		usdcRoutingStatus,
	]);

	return null;
}
