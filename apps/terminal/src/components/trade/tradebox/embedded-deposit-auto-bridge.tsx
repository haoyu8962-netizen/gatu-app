import { useLingui } from "@lingui/react/macro";
import { useEffect, useLayoutEffect, useRef } from "react";
import { toast } from "sonner";
import { formatUnits } from "viem";
import { isCctpSponsoredDepositEnabled } from "@/config/cctp-deposit";
import { MIN_DEPOSIT_USDC, USDC_DECIMALS } from "@/config/contracts";
import { DEPOSIT_BALANCE_REFRESH_MS } from "@/config/time";
import { getUsdcRoutingQueryStatus } from "@/domain/trade/usdc-routing";
import { useCctpDepositTracking } from "@/hooks/trade/use-cctp-deposit-tracking";
import { UsdcDepositRouteError, useUsdcRouting } from "@/hooks/trade/use-usdc-routing";
import { useEmailEmbeddedWallet } from "@/hooks/wallet/use-email-embedded-wallet";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatTransferError, isSmartWalletNonceConflict } from "@/lib/errors/format";
import { useDeposit } from "@/lib/hyperliquid/use-deposit";
import { formatFundsActionFeedback } from "@/lib/trade/funds-action-feedback";
import { runWithExclusiveBrowserLock } from "@/lib/wallet/exclusive-browser-lock";
import { getPrivyEmailAddress } from "@/lib/wallet/privy-wagmi";
import { useDepositModalOpen } from "@/stores/use-global-modal-store";
import { useIsTestnet } from "@/stores/use-global-settings-store";

const AUTO_DEPOSIT_TOAST_PREFIX = "embedded-cctp-auto-deposit";
const AUTO_DEPOSIT_RETRY_DELAY_MS = 30_000;
const AUTO_DEPOSIT_MAX_RETRY_DELAY_MS = 5 * 60_000;
let notificationPresentationSequence = 0;

export function EmbeddedDepositAutoBridge() {
	const { t } = useLingui();
	const isTestnet = useIsTestnet();
	const depositModalOpen = useDepositModalOpen();
	const sponsoredCctpReleaseEnabled = isCctpSponsoredDepositEnabled(isTestnet);
	const automaticDepositEnabled = isTestnet && sponsoredCctpReleaseEnabled;
	const { user, embeddedWalletAddress, walletIntent } = useWalletSession();
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
	const isEmbeddedDeposit = !!emailAddress && walletIntent === "embedded" && shouldUseEmailEmbeddedWallet;
	const cctpTrackingEnv = isTestnet ? "Testnet" : "Mainnet";
	const notificationIdentity =
		isEmbeddedDeposit && depositEmbeddedWalletAddress
			? `${AUTO_DEPOSIT_TOAST_PREFIX}:${cctpTrackingEnv}:${depositEmbeddedWalletAddress.toLowerCase()}`
			: null;
	const cctpDepositTracking = useCctpDepositTracking({
		enabled: isEmbeddedDeposit && !!depositEmbeddedWalletAddress,
		env: cctpTrackingEnv,
		owner: depositEmbeddedWalletAddress,
		removeOnForwardSubmitted: !depositModalOpen,
	});
	const usdcRoutingQuery = useUsdcRouting(
		automaticDepositEnabled && isEmbeddedDeposit && !!depositEmbeddedWalletAddress,
	);
	const usdcRoutingStatus = getUsdcRoutingQueryStatus({
		data: usdcRoutingQuery.data,
		isError: usdcRoutingQuery.isError,
		isFetching: usdcRoutingQuery.isFetching,
	});
	const selectedDepositRoute = usdcRoutingQuery.data?.depositRoute ?? "cctp";
	const autoCctpRouteAvailable = usdcRoutingStatus === "ready" && usdcRoutingQuery.data?.depositRoute === "cctp";
	const shouldMonitorDepositBalance =
		isEmbeddedDeposit &&
		!!depositEmbeddedWalletAddress &&
		automaticDepositEnabled &&
		autoCctpRouteAvailable &&
		!cctpDepositTracking.recoveryRecord;
	const attemptKeyRef = useRef<string | null>(null);
	const lastEligibleKeyRef = useRef<string | null>(null);
	const retryKeyRef = useRef<string | null>(null);
	const retryCountRef = useRef(0);
	const retryTimeoutRef = useRef<number | null>(null);
	const activeAttemptAbortRef = useRef<AbortController | null>(null);
	const activeAttemptIdentityRef = useRef<string | null>(null);
	const reconciledErrorRef = useRef<Error | null>(null);
	const loadingToastActiveRef = useRef(false);
	const notificationPresentationRef = useRef<string | null>(null);

	const {
		maxDepositRaw,
		status: depositStatus,
		error: depositError,
		deposit,
		refreshBalance,
		reset: resetDeposit,
		networkName,
		sponsoredCctpEnabled,
	} = useDeposit({
		balanceEnabled: shouldMonitorDepositBalance,
		balancePollIntervalMs: DEPOSIT_BALANCE_REFRESH_MS,
		depositRoute: selectedDepositRoute,
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
		automaticDepositEnabled &&
		sponsoredCctpEnabled &&
		!cctpDepositTracking.recoveryRecord &&
		!needsEmbeddedWallet &&
		!isCreatingEmbeddedWallet &&
		!embeddedWalletError &&
		depositEmbeddedWalletAddress &&
		maxDepositRaw !== undefined &&
		maxDepositRaw >= MIN_DEPOSIT_USDC
			? `${networkName}:${depositEmbeddedWalletAddress.toLowerCase()}:${maxDepositRaw.toString()}`
			: null;
	const eligibleDepositKey = balanceEligibleKey && autoCctpRouteAvailable ? balanceEligibleKey : null;
	const depositIdentityKey =
		isEmbeddedDeposit && depositEmbeddedWalletAddress
			? `${networkName}:${depositEmbeddedWalletAddress.toLowerCase()}`
			: null;

	useEffect(() => {
		return () => {
			if (retryTimeoutRef.current) window.clearTimeout(retryTimeoutRef.current);
			activeAttemptAbortRef.current?.abort();
			attemptKeyRef.current = null;
			lastEligibleKeyRef.current = null;
			retryKeyRef.current = null;
			retryCountRef.current = 0;
			retryTimeoutRef.current = null;
			activeAttemptAbortRef.current = null;
			activeAttemptIdentityRef.current = null;
			reconciledErrorRef.current = null;
			loadingToastActiveRef.current = false;
		};
	}, []);

	useLayoutEffect(() => {
		if (!notificationIdentity) return;
		return () => {
			const presentationId = notificationPresentationRef.current;
			if (presentationId) toast.dismiss(presentationId);
			notificationPresentationRef.current = null;
			loadingToastActiveRef.current = false;
		};
	}, [notificationIdentity]);

	useEffect(() => {
		function scheduleRetry(retryKey: string) {
			if (retryTimeoutRef.current) return;

			retryKeyRef.current = retryKey;
			const retryDelay = Math.min(
				AUTO_DEPOSIT_RETRY_DELAY_MS * 2 ** Math.min(retryCountRef.current, 3),
				AUTO_DEPOSIT_MAX_RETRY_DELAY_MS,
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

			if (retryTimeoutRef.current) {
				window.clearTimeout(retryTimeoutRef.current);
				retryTimeoutRef.current = null;
			}
			retryKeyRef.current = null;

			if (attemptKeyRef.current !== eligibleDepositKey) {
				attemptKeyRef.current = null;
				resetDeposit();
				return;
			}

			// A rejected smart-account submission can still have reached the bundler.
			// Keep the failed attempt latched until its balance/identity changes instead
			// of signing a second EIP-3009 authorization automatically.
			return;
		}

		if (attemptKeyRef.current === eligibleDepositKey) return;
		if (!depositEmbeddedWalletAddress) return;

		attemptKeyRef.current = eligibleDepositKey;
		const abortController = new AbortController();
		activeAttemptAbortRef.current = abortController;
		activeAttemptIdentityRef.current = depositIdentityKey;
		const normalizedWalletAddress = depositEmbeddedWalletAddress.toLowerCase();
		const lockName = `gatu:embedded-cctp-deposit:${networkName}:${normalizedWalletAddress}`;

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
		depositStatus,
		depositIdentityKey,
		eligibleDepositKey,
		maxDepositRaw,
		networkName,
		refreshBalance,
		resetDeposit,
	]);

	useEffect(() => {
		if (!notificationIdentity) return;
		function getNotificationOptions() {
			const id = notificationPresentationRef.current ?? `${notificationIdentity}:${++notificationPresentationSequence}`;
			notificationPresentationRef.current = id;
			function clearPresentation() {
				if (notificationPresentationRef.current === id) notificationPresentationRef.current = null;
			}
			return { id, onDismiss: clearPresentation, onAutoClose: clearPresentation };
		}
		if (isEmbeddedDeposit && balanceEligibleKey && !autoCctpRouteAvailable) {
			if (usdcRoutingStatus === "loading") {
				loadingToastActiveRef.current = true;
				toast.loading(t`Checking the current Hyperliquid deposit route...`, getNotificationOptions());
			} else if (usdcRoutingStatus === "ready" && usdcRoutingQuery.data?.depositRoute === "bridge") {
				loadingToastActiveRef.current = false;
				toast.error(
					t`Legacy Bridge2 deposits are no longer accepted. Automatic deposits are paused.`,
					getNotificationOptions(),
				);
			} else {
				loadingToastActiveRef.current = false;
				toast.error(
					t`Unable to verify the current Hyperliquid deposit route. Automatic deposits are paused.`,
					getNotificationOptions(),
				);
			}
			return;
		}

		if (!isEmbeddedDeposit || depositStatus === "idle") {
			if (loadingToastActiveRef.current) {
				const presentationId = notificationPresentationRef.current;
				if (presentationId) toast.dismiss(presentationId);
				notificationPresentationRef.current = null;
				loadingToastActiveRef.current = false;
			}
			return;
		}

		if (depositStatus === "pending") {
			loadingToastActiveRef.current = true;
			toast.loading(t`Preparing automatic USDC deposit...`, getNotificationOptions());
			return;
		}

		if (depositStatus === "confirming") {
			loadingToastActiveRef.current = true;
			toast.loading(t`Depositing USDC to Hyperliquid...`, getNotificationOptions());
			return;
		}

		if (depositStatus === "success") {
			loadingToastActiveRef.current = false;
			toast.success(t`USDC deposit submitted to Hyperliquid`, getNotificationOptions());
			return;
		}

		if (depositStatus === "error") {
			loadingToastActiveRef.current = false;
			const depositErrorMessage =
				depositError instanceof UsdcDepositRouteError
					? formatFundsActionFeedback(
							depositError.reason === "changed" ? "deposit-route-changed" : "deposit-route-unavailable",
							(descriptor) => t(descriptor),
						)
					: depositError
						? formatTransferError(depositError, (descriptor) => t(descriptor))
						: t`Automatic USDC deposit failed`;
			toast.error(depositErrorMessage, getNotificationOptions());
		}
	}, [
		balanceEligibleKey,
		autoCctpRouteAvailable,
		depositError,
		depositStatus,
		isEmbeddedDeposit,
		notificationIdentity,
		usdcRoutingQuery.data?.depositRoute,
		usdcRoutingStatus,
		t,
	]);

	return null;
}
