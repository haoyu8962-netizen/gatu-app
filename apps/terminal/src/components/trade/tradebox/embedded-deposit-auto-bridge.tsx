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

	const {
		maxDepositRaw,
		status: depositStatus,
		error: depositError,
		deposit,
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

	const shouldDeposit =
		isEmbeddedDeposit &&
		smartDepositEnabled &&
		!!depositEmbeddedWalletAddress &&
		!needsEmbeddedWallet &&
		!isCreatingEmbeddedWallet &&
		!embeddedWalletError &&
		depositStatus === "idle" &&
		maxDepositRaw !== undefined &&
		maxDepositRaw >= MIN_DEPOSIT_USDC;

	useEffect(() => {
		if (!shouldDeposit || maxDepositRaw === undefined || !depositEmbeddedWalletAddress) return;

		const attemptKey = `${depositEmbeddedWalletAddress}:${maxDepositRaw.toString()}`;
		if (attemptKeyRef.current === attemptKey) return;

		attemptKeyRef.current = attemptKey;
		deposit(formatUnits(maxDepositRaw, USDC_DECIMALS));
	}, [deposit, depositEmbeddedWalletAddress, maxDepositRaw, shouldDeposit]);

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
