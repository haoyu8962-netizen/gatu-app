import { t } from "@lingui/core/macro";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { formatUnits } from "viem";
import { MIN_DEPOSIT_USDC, USDC_DECIMALS } from "@/config/contracts";
import { DEPOSIT_BALANCE_REFRESH_MS } from "@/config/time";
import { useEmailEmbeddedWallet } from "@/hooks/wallet/use-email-embedded-wallet";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useDeposit } from "@/lib/hyperliquid/use-deposit";
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
	const attemptKeyRef = useRef<string | null>(null);
	const lastEligibleKeyRef = useRef<string | null>(null);
	const retryKeyRef = useRef<string | null>(null);
	const retryCountRef = useRef(0);
	const retryTimeoutRef = useRef<number | null>(null);

	const {
		maxDepositRaw,
		status: depositStatus,
		error: depositError,
		deposit,
		reset: resetDeposit,
		smartDepositEnabled,
	} = useDeposit({
		balanceEnabled: isEmbeddedDeposit && !!depositEmbeddedWalletAddress,
		balancePollIntervalMs: DEPOSIT_BALANCE_REFRESH_MS,
		mode: "smart",
		walletAddress: isEmbeddedDeposit ? depositEmbeddedWalletAddress : undefined,
	});

	useEffect(() => {
		if (!isEmbeddedDeposit || !needsEmbeddedWallet || isCreatingEmbeddedWallet) return;
		void ensureEmailEmbeddedWallet().catch(() => {});
	}, [ensureEmailEmbeddedWallet, isCreatingEmbeddedWallet, isEmbeddedDeposit, needsEmbeddedWallet]);

	const eligibleDepositKey =
		isEmbeddedDeposit &&
		smartDepositEnabled &&
		!needsEmbeddedWallet &&
		!isCreatingEmbeddedWallet &&
		!embeddedWalletError &&
		depositEmbeddedWalletAddress &&
		maxDepositRaw !== undefined &&
		maxDepositRaw >= MIN_DEPOSIT_USDC
			? `${depositEmbeddedWalletAddress}:${maxDepositRaw.toString()}`
			: null;

	useEffect(() => {
		return () => {
			if (retryTimeoutRef.current) window.clearTimeout(retryTimeoutRef.current);
		};
	}, []);

	useEffect(() => {
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
			if (attemptKeyRef.current !== eligibleDepositKey) {
				attemptKeyRef.current = null;
				resetDeposit();
				return;
			}

			if (!retryTimeoutRef.current) {
				retryKeyRef.current = eligibleDepositKey;
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
			return;
		}

		if (attemptKeyRef.current === eligibleDepositKey) return;

		attemptKeyRef.current = eligibleDepositKey;
		deposit(formatUnits(maxDepositRaw, USDC_DECIMALS));
	}, [deposit, depositStatus, eligibleDepositKey, maxDepositRaw, resetDeposit]);

	useEffect(() => {
		if (!isEmbeddedDeposit) return;

		if (depositStatus === "pending") {
			toast.loading(t`Preparing automatic USDC deposit...`, { id: AUTO_BRIDGE_TOAST_ID });
			return;
		}

		if (depositStatus === "confirming") {
			toast.loading(t`Depositing USDC to Hyperliquid...`, { id: AUTO_BRIDGE_TOAST_ID });
			return;
		}

		if (depositStatus === "success") {
			toast.success(t`USDC deposit submitted to Hyperliquid`, { id: AUTO_BRIDGE_TOAST_ID });
			return;
		}

		if (depositStatus === "error") {
			toast.error(depositError?.message || t`Automatic USDC deposit failed`, { id: AUTO_BRIDGE_TOAST_ID });
		}
	}, [depositError?.message, depositStatus, isEmbeddedDeposit]);

	return null;
}
