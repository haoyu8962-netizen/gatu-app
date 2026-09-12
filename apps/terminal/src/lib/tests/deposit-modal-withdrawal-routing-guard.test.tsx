// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ButtonHTMLAttributes, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DepositModal } from "@/components/trade/tradebox/deposit-modal";
import { AccountAbstractionExecutionError } from "@/hooks/trade/use-account-abstraction-guard";
import { FundsActionGeoExecutionError } from "@/hooks/trade/use-funds-action-availability";
import { UsdcDepositRouteError } from "@/hooks/trade/use-usdc-routing";
import { DefinitiveDepositSourceFailureError } from "@/lib/hyperliquid/deposit-source-error";

const WITHDRAWAL_MESSAGES = {
	accountModeChanged: "Account mode changed before the request was submitted. Review balances and try again.",
	balanceChanged: "Balance changed before submission. Review the updated balance and try again.",
	balanceUnavailable: "Balance data is unavailable. Try again after the connection recovers.",
	depositRouteChanged: "The Hyperliquid deposit route changed before signing. Review the updated route and retry.",
	feeChanged: "Circle fees changed before submission. Review the updated fee and retry.",
	feeUnavailable: "Unable to load the current CCTP withdrawal fee.",
	geoUnavailable: "Unable to verify regional availability. This funds action was not submitted.",
	preTransferChanged: "The account activation fee changed before signing. Review the updated fee and try again.",
	preTransferSanctioned: "Withdrawals are unavailable for this address.",
	preTransferUnavailable: "Unable to verify withdrawal eligibility. Request was not submitted.",
	routeChanged: "The Hyperliquid withdrawal route changed. Review the updated route and fee, then submit again.",
	routeUnavailable: "Unable to verify the current Hyperliquid withdrawal route.",
} as const;

const WITHDRAWAL_MESSAGES_AR: Record<keyof typeof WITHDRAWAL_MESSAGES, string> = {
	accountModeChanged: "تغيّر وضع الحساب قبل إرسال الطلب. راجع الأرصدة وحاول مرة أخرى.",
	balanceChanged: "تغيّر الرصيد قبل الإرسال. راجع الرصيد المحدّث وحاول مرة أخرى.",
	balanceUnavailable: "بيانات الرصيد غير متاحة. حاول مرة أخرى بعد استعادة الاتصال.",
	depositRouteChanged: "تغيّر مسار الإيداع في Hyperliquid قبل التوقيع. راجع المسار المحدّث وأعد المحاولة.",
	feeChanged: "تغيرت رسوم Circle قبل الإرسال. راجع الرسوم المحدّثة وأعد المحاولة.",
	feeUnavailable: "تعذر تحميل رسوم السحب الحالية عبر CCTP.",
	geoUnavailable: "تعذّر التحقق من التوفر في منطقتك. لم يتم إرسال عملية إدارة الأموال هذه.",
	preTransferChanged: "تغيرت رسوم تفعيل الحساب قبل التوقيع. راجع الرسوم المحدّثة وحاول مرة أخرى.",
	preTransferSanctioned: "عمليات السحب غير متاحة لهذا العنوان.",
	preTransferUnavailable: "تعذر التحقق من أهلية السحب. لم يتم إرسال الطلب.",
	routeChanged: "تغيّر مسار السحب في Hyperliquid. راجع المسار المحدّث والرسوم المحدّثة، ثم أرسل الطلب مرة أخرى.",
	routeUnavailable: "تعذّر التحقق من مسار السحب الحالي في Hyperliquid.",
};

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = Object.fromEntries(
	Object.entries(WITHDRAWAL_MESSAGES).map(([key, message]) => [
		getMessageId(message),
		WITHDRAWAL_MESSAGES_AR[key as keyof typeof WITHDRAWAL_MESSAGES_AR],
	]),
);

const testState = vi.hoisted(() => ({
	accountGuard: vi.fn(),
	accountAbstraction: "disabled" as string | null,
	activeTab: "deposit" as "deposit" | "withdraw",
	cctpDepositFeeCalculation: { maxFeeRaw: 200_000n, netAmountRaw: 4_800_000n } as {
		maxFeeRaw: bigint;
		netAmountRaw: bigint;
	} | null,
	cctpDepositFeeCalls: [] as Array<{ amountRaw: bigint | undefined; enabled: boolean; isTestnet: boolean }>,
	cctpWithdrawalFee: "1",
	cctpWithdrawalFeeError: false,
	cctpWithdrawalFeeRefetch: vi.fn(),
	depositAvailable: true,
	depositUnavailableReason: null as string | null,
	deposit: vi.fn(),
	depositError: null as Error | null,
	depositExecutionRoute: null as "bridge" | "cctp" | null,
	depositHash: undefined as `0x${string}` | undefined,
	depositMaxRaw: 10_000_000n,
	depositStatus: "idle" as "idle" | "pending" | "confirming" | "success" | "error",
	hyperliquidClientKey: "0x1111111111111111111111111111111111111111",
	hyperliquidEnv: "Mainnet" as "Mainnet" | "Testnet",
	hyperliquidSessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
	emailAddress: null as string | null,
	submissionOutcomeUnknown: false,
	exchangeSignal: undefined as AbortSignal | undefined,
	exchangeGuards: new Map<string, ((params?: unknown, signal?: AbortSignal) => Promise<void>) | undefined>(),
	exchangeFinalWait: vi.fn(),
	exchangeErrors: new Map<string, unknown>(),
	exchangeMutations: new Map<string, ReturnType<typeof vi.fn>>(),
	exchangeSdkCalls: new Map<string, ReturnType<typeof vi.fn>>(),
	fetchFreshRouting: vi.fn(),
	freshRoutingError: null as Error | null,
	freshRoutingResponse: { depositRoute: "bridge", withdrawalRoute: "cctp" } as unknown,
	fundsActionAvailable: true,
	fundsActionUnavailableReason: null as string | null,
	assertFreshGeoAllowed: vi.fn(),
	balanceStale: false,
	infoQueryCalls: [] as Array<{ enabled: boolean; method: string; params: unknown }>,
	modalOpen: false,
	modalOnOpenChange: null as null | ((open: boolean) => void),
	preTransferFresh: {
		fee: "0",
		isSanctioned: false,
		userExists: true,
		userHasSentTx: true,
	},
	preTransferInfo: vi.fn(),
	preTransferRefetch: vi.fn(),
	preTransferReview: {
		fee: "0",
		isSanctioned: false,
		userExists: true,
		userHasSentTx: true,
	},
	routingResponse: { depositRoute: "bridge", withdrawalRoute: "cctp" } as unknown,
	routingError: false,
	routingRefetch: vi.fn(),
	sponsoredReadinessFailure: null as
		| "build-gate-disabled"
		| "smart-client-unavailable"
		| "wrong-chain"
		| "paymaster-unavailable"
		| null,
	sponsoredReadinessRetry: vi.fn(),
	sponsoredReadinessStatus: "ready" as "idle" | "loading" | "ready" | "error",
	spotMeta: {
		tokens: [{ index: 37, isCanonical: true, name: "USDC" }],
		universe: [],
	},
	spotMetaRefetch: vi.fn(),
	spotMetaError: false,
	preTransferError: false,
	spotBalances: [] as Array<{ coin: string; total: string; hold: string; token: number; entryNtl: string }>,
	useDepositOptions: null as Record<string, unknown> | null,
	walletIntentOverride: undefined as "ambiguous" | "embedded" | "external" | "unavailable" | undefined,
	walletAddress: "0x1111111111111111111111111111111111111111",
	withdrawable: "10",
	withdrawDraft: "2",
	withdrawSubmit: null as null | (() => Promise<void> | void),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@gatu/ui", () => ({
	Button: ({ children, disabled, onClick }: ButtonHTMLAttributes<HTMLButtonElement>) =>
		createElement("button", { disabled, onClick, type: "button" }, children),
	ModalContent: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
	ModalHeader: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
	ModalTitle: ({ children, className }: { children?: ReactNode; className?: string }) =>
		createElement("h2", { className }, children),
}));

vi.mock("@/domain/trade/balances", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/domain/trade/balances")>();
	return {
		getSpotBalance: actual.getSpotBalance,
		getSpotTransferableValue: actual.getSpotTransferableValue,
		isQuoteBalanceSharedWithPerps: actual.isQuoteBalanceSharedWithPerps,
		getAccountBalanceSummary: () => ({
			hasSpotFundsWhenPerpWithdrawableZero: true,
			isAvailable: true,
			usesSpotStateForPerps: actual.isQuoteBalanceSharedWithPerps(
				testState.accountAbstraction as Parameters<typeof actual.isQuoteBalanceSharedWithPerps>[0],
			),
			spotUsdcAvailable: 0,
			withdrawable: Number(testState.withdrawable),
		}),
	};
});

vi.mock("@/hooks/trade/use-account-abstraction-guard", () => ({
	AccountAbstractionExecutionError: class AccountAbstractionExecutionError extends Error {
		constructor(readonly reason: "changed" | "unavailable") {
			super(reason);
		}
	},
	useAccountAbstractionPreExecutionGuard: () => testState.accountGuard,
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: (value: unknown) =>
		value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin",
	useDefaultDexBalances: () => ({
		accountAbstraction: testState.accountAbstraction,
		marginSummary: null,
		perpSummary: null,
		spotAvailableAfterMaintenance: null,
		spotBalances: testState.spotBalances,
		withdrawable: testState.withdrawable,
		spotStateStatus: "success",
		perpStateStatus: "success",
		spotStateReceivedAt: Date.now(),
		perpStateReceivedAt: Date.now(),
		isDataStale: testState.balanceStale,
		hasError: false,
	}),
}));

vi.mock("@/hooks/trade/use-cctp-withdrawal-fee", () => ({
	useCctpWithdrawalFee: () => ({
		data: testState.cctpWithdrawalFee,
		isError: testState.cctpWithdrawalFeeError,
		isFetching: false,
		isSuccess: !testState.cctpWithdrawalFeeError,
		refetch: testState.cctpWithdrawalFeeRefetch,
	}),
}));

vi.mock("@/hooks/trade/use-cctp-deposit-fee", () => ({
	useCctpDepositFee: (options: { amountRaw: bigint | undefined; enabled: boolean; isTestnet: boolean }) => {
		testState.cctpDepositFeeCalls.push(options);
		const feeQuote = {
			finalityThreshold: 1000,
			forwardFeeRaw: { high: 200_001n, low: 199_999n, med: 200_000n },
			minimumFeeBps: "0",
		};
		return {
			calculation: testState.cctpDepositFeeCalculation,
			data: { fastAllowanceRaw: 100_000_000n, feeQuote },
			hasSufficientFastAllowance: true,
			isError: false,
			isLoading: false,
			refetch: vi.fn().mockResolvedValue({
				data: {
					fastAllowanceRaw: 100_000_000n,
					feeQuote,
				},
				isError: false,
			}),
		};
	},
}));

vi.mock("@/config/cctp-deposit", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/config/cctp-deposit")>();
	return {
		...original,
		isCctpExternalDepositEnabled: () => true,
		isCctpSponsoredDepositEnabled: () => true,
	};
});

vi.mock("@/hooks/trade/use-cctp-deposit-tracking", () => ({
	useCctpDepositTracking: () => ({ data: undefined, isError: false, recoveryRecord: null }),
}));

vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({
		available: testState.depositAvailable,
		path: testState.emailAddress ? "sponsored" : "external",
		reason: testState.depositAvailable ? null : "geo-unresolved",
		releasePathEnabled: true,
		signerReady: true,
		unavailableLabel: "Deposit unavailable",
		unavailableReason: testState.depositUnavailableReason,
	}),
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({
		isResolved: testState.fundsActionAvailable,
		proxy: false,
		tradeRestricted: false,
		isError: false,
	}),
}));

vi.mock(import("../../hooks/trade/use-funds-action-availability"), async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		useFundsActionAvailability: (input: Parameters<typeof actual.useFundsActionAvailability>[0]) => ({
			...actual.useFundsActionAvailability(input),
			assertFreshGeoAllowed: testState.assertFreshGeoAllowed,
		}),
	};
});

vi.mock("@/hooks/trade/use-usdc-routing", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/hooks/trade/use-usdc-routing")>();
	return {
		...original,
		useFreshUsdcRouting: () => testState.fetchFreshRouting,
		useUsdcRouting: () => ({
			data: testState.routingResponse,
			isError: testState.routingError,
			isFetching: false,
			refetch: testState.routingRefetch,
		}),
	};
});

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => false,
}));

vi.mock("@/hooks/wallet/use-email-embedded-wallet", () => ({
	useEmailEmbeddedWallet: () => ({
		emailAddress: testState.emailAddress,
		embeddedWalletAddress: testState.emailAddress ? "0x1111111111111111111111111111111111111111" : null,
		embeddedWalletError: null,
		ensureEmailEmbeddedWallet: vi.fn(),
		isCreatingEmbeddedWallet: false,
		needsEmbeddedWallet: false,
		shouldUseEmbeddedWallet: testState.emailAddress !== null,
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useReconnectWallet: () => ({
		isReconnecting: false,
		reconnectWallet: vi.fn(),
		walletsReady: true,
	}),
	useWalletSession: () => ({
		embeddedWalletAddress: testState.emailAddress ? "0x1111111111111111111111111111111111111111" : null,
		hasWalletAccess: true,
		user: testState.emailAddress ? {} : null,
		walletAddress: testState.walletAddress,
		walletIntent: testState.walletIntentOverride ?? (testState.emailAddress ? "embedded" : "external"),
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	infoQueryOptions: (_info: unknown, method: string, params: unknown, env: string) => ({
		queryKey: ["hl", env, method, params],
	}),
	useExchange: (
		method: string,
		options?: {
			executionGuard?: (params: unknown) => void;
			preExecutionGuard?: (params?: unknown, signal?: AbortSignal) => Promise<void>;
		},
	) => {
		testState.exchangeGuards.set(method, options?.preExecutionGuard);
		let sdkCall = testState.exchangeSdkCalls.get(method);
		if (!sdkCall) {
			sdkCall = vi.fn().mockResolvedValue(undefined);
			testState.exchangeSdkCalls.set(method, sdkCall);
		}
		let mutateAsync = testState.exchangeMutations.get(method);
		if (!mutateAsync) {
			const callSdk = sdkCall as (params: unknown) => unknown;
			mutateAsync = vi.fn(async (params: unknown) => {
				try {
					options?.executionGuard?.(params);
					const signal = testState.exchangeSignal ?? new AbortController().signal;
					await options?.preExecutionGuard?.(params, signal);
					await testState.exchangeFinalWait();
					options?.executionGuard?.(params);
					return await callSdk(params);
				} catch (error) {
					testState.exchangeErrors.set(method, error);
					throw error;
				}
			});
		}
		testState.exchangeMutations.set(method, mutateAsync);
		return {
			error: testState.exchangeErrors.get(method) ?? null,
			isPending: false,
			isSuccess: false,
			mutateAsync,
			reset: vi.fn(() => testState.exchangeErrors.delete(method)),
		};
	},
	useHyperliquid: () => ({
		clientKey: testState.hyperliquidClientKey,
		env: testState.hyperliquidEnv,
		info: { preTransferCheck: testState.preTransferInfo },
		sessionMode: testState.hyperliquidSessionMode,
	}),
	useInfo: (method: string, params: unknown, options?: { enabled?: boolean }) => {
		testState.infoQueryCalls.push({ enabled: options?.enabled !== false, method, params });
		if (method === "spotMeta") {
			return {
				data: testState.spotMeta,
				isError: testState.spotMetaError,
				isFetching: false,
				isSuccess: options?.enabled !== false && !testState.spotMetaError,
				refetch: testState.spotMetaRefetch,
			};
		}
		if (method === "preTransferCheck") {
			return {
				data: testState.preTransferReview,
				isError: testState.preTransferError,
				isFetching: false,
				isSuccess: options?.enabled !== false && !testState.preTransferError,
				refetch: testState.preTransferRefetch,
			};
		}
		throw new Error(`Unexpected info method: ${method}`);
	},
}));

vi.mock("@/lib/hyperliquid/use-deposit", () => ({
	useDeposit: (options: Record<string, unknown>) => {
		testState.useDepositOptions = options;
		return {
			balance: "0",
			balanceError: null,
			balanceStatus: "idle",
			deposit: testState.deposit,
			error: testState.depositError,
			executionAmount: null,
			executionRoute: testState.depositExecutionRoute,
			hash: testState.depositHash,
			isArbitrum: true,
			isSwitching: false,
			maxAmount: "10",
			maxDepositRaw: testState.depositMaxRaw,
			networkName: "Arbitrum",
			reset: vi.fn(),
			sponsoredCctpEnabled: true,
			sponsoredCctpReadiness: {
				failure: testState.sponsoredReadinessFailure,
				retry: testState.sponsoredReadinessRetry,
				status: testState.sponsoredReadinessStatus,
			},
			status: testState.depositStatus,
			switchError: null,
			switchToArbitrum: vi.fn(),
			validate: () => ({ error: null, valid: true }),
			walletProviderError: null,
			walletProviderStatus: "idle",
			walletResponseDelayed: false,
			cctpRecoveryUnavailable: false,
			submissionOutcomeUnknown: testState.submissionOutcomeUnknown,
		};
	},
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: () => () => null,
}));

vi.mock("@/lib/lifi/bridge-execution-state", () => ({
	useHasExistingBridgeExecution: () => false,
}));

vi.mock("@/lib/wallet/privy-wagmi", () => ({
	getPrivyEmailAddress: () => testState.emailAddress,
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ close: vi.fn() }),
	useDepositModalOpen: () => testState.modalOpen,
	useDepositModalTab: () => testState.activeTab,
	useTransferModalActions: () => ({ open: vi.fn() }),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useIsTestnet: () => false,
}));

vi.mock("@/components/trade/components/pending-action-modal", () => ({
	PendingActionModal: ({ children, onOpenChange }: { children?: ReactNode; onOpenChange: (open: boolean) => void }) => {
		testState.modalOnOpenChange = onOpenChange;
		return createElement("div", null, children);
	},
}));

vi.mock("@/components/trade/tradebox/deposit/deposit-form", () => ({
	DepositForm: ({
		onRetryRouting,
		onSubmit,
		requiresExplicitFundingDeposit,
		routingPreflightError,
		routingStatus,
		usesFundingAddressFlow,
		fundingAddress,
		cctpFee,
		sponsoredCctpReadiness,
	}: {
		cctpFee?: string | null;
		fundingAddress?: string;
		onRetryRouting: () => void;
		onSubmit: () => void;
		requiresExplicitFundingDeposit?: boolean;
		routingPreflightError?: string | null;
		routingStatus: string;
		sponsoredCctpReadiness: { status: string };
		usesFundingAddressFlow: boolean;
	}) =>
		createElement(
			"div",
			{
				"data-cctp-fee": cctpFee,
				"data-funding-address": fundingAddress,
				"data-readiness-status": sponsoredCctpReadiness.status,
				"data-testid": "deposit-routing-status",
				"data-status": routingStatus,
			},
			routingPreflightError
				? createElement("p", { "data-testid": "deposit-routing-preflight-error", role: "alert" }, routingPreflightError)
				: null,
			!usesFundingAddressFlow || (requiresExplicitFundingDeposit && sponsoredCctpReadiness.status === "ready")
				? createElement(
						"button",
						{ onClick: onSubmit, type: "button" },
						requiresExplicitFundingDeposit ? "Deposit 10 USDC" : "Submit deposit",
					)
				: null,
			createElement("button", { onClick: onRetryRouting, type: "button" }, "Retry deposit route"),
		),
}));

vi.mock("@/components/trade/tradebox/deposit/shared-ui", () => ({
	StatusScreen: ({
		children,
		description,
		heading,
	}: {
		children?: ReactNode;
		description?: ReactNode;
		heading?: ReactNode;
	}) =>
		createElement(
			"div",
			{ "data-testid": "status-screen" },
			createElement("p", { "data-testid": "status-heading" }, heading),
			createElement("p", { "data-testid": "status-description" }, description),
			children,
		),
	WalletNotConnected: () => null,
}));

vi.mock("@/components/trade/tradebox/deposit/withdraw-form", () => ({
	WithdrawForm: ({
		activationFee,
		amount,
		available,
		maxAmount,
		onAmountChange,
		onRetryPrerequisites,
		onSubmit,
		routingStatus,
		routingPreflightFailed,
		showSpotFundsNotice,
		prerequisiteError,
		canSubmit,
	}: {
		prerequisiteError: string | null;
		canSubmit: boolean;
		activationFee: string;
		amount: string;
		available: string;
		maxAmount: string;
		onAmountChange: (amount: string) => void;
		onRetryPrerequisites: () => void;
		onSubmit: () => void;
		routingStatus: string;
		routingPreflightFailed?: boolean;
		showSpotFundsNotice: boolean;
	}) => {
		testState.withdrawSubmit = onSubmit;
		return createElement(
			"div",
			{
				"data-activation-fee": activationFee,
				"data-amount": amount,
				"data-available": available,
				"data-max-amount": maxAmount,
				"data-show-spot-funds-notice": showSpotFundsNotice,
				"data-testid": "withdraw-routing-status",
				"data-status": routingStatus,
				"data-preflight-failed": routingPreflightFailed,
			},
			createElement("button", { onClick: () => onAmountChange(testState.withdrawDraft), type: "button" }, "Set amount"),
			createElement("p", { "data-testid": "withdrawal-prerequisite" }, prerequisiteError),
			createElement("button", { disabled: !canSubmit, onClick: onSubmit, type: "button" }, "Submit withdrawal"),
			createElement("button", { onClick: onRetryPrerequisites, type: "button" }, "Retry withdrawal route"),
		);
	},
}));

vi.mock("@/components/trade/tradebox/deposit/wrong-network-screen", () => ({
	WrongNetworkScreen: () => null,
}));

describe("DepositModal withdrawal route pre-execution guard wiring", () => {
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;

	beforeEach(async () => {
		vi.clearAllMocks();
		testState.accountAbstraction = "disabled";
		i18n.loadAndActivate({ locale: "en", messages: {} });
		testState.exchangeGuards.clear();
		testState.exchangeErrors.clear();
		testState.exchangeMutations.clear();
		testState.exchangeSdkCalls.clear();
		testState.exchangeSignal = new AbortController().signal;
		testState.exchangeFinalWait.mockReset();
		testState.exchangeFinalWait.mockResolvedValue(undefined);
		testState.accountGuard.mockReset();
		testState.accountGuard.mockResolvedValue(undefined);
		testState.assertFreshGeoAllowed.mockReset();
		testState.assertFreshGeoAllowed.mockResolvedValue(undefined);
		testState.balanceStale = false;
		testState.accountAbstraction = "disabled";
		testState.freshRoutingError = null;
		testState.freshRoutingResponse = { depositRoute: "bridge", withdrawalRoute: "cctp" };
		testState.fundsActionAvailable = true;
		testState.fundsActionUnavailableReason = null;
		testState.infoQueryCalls.length = 0;
		testState.activeTab = "deposit";
		testState.modalOpen = false;
		testState.modalOnOpenChange = null;
		testState.deposit.mockReset();
		testState.depositAvailable = true;
		testState.depositUnavailableReason = null;
		testState.depositError = null;
		testState.depositExecutionRoute = null;
		testState.depositHash = undefined;
		testState.depositMaxRaw = 10_000_000n;
		testState.depositStatus = "idle";
		testState.hyperliquidClientKey = "0x1111111111111111111111111111111111111111";
		testState.hyperliquidEnv = "Mainnet";
		testState.hyperliquidSessionMode = "wallet";
		testState.emailAddress = null;
		testState.cctpDepositFeeCalculation = { maxFeeRaw: 200_000n, netAmountRaw: 4_800_000n };
		testState.cctpDepositFeeCalls.length = 0;
		testState.cctpWithdrawalFee = "1";
		testState.cctpWithdrawalFeeError = false;
		testState.cctpWithdrawalFeeRefetch.mockReset();
		testState.cctpWithdrawalFeeRefetch.mockResolvedValue({ data: "1", isError: false });
		testState.sponsoredReadinessFailure = null;
		testState.sponsoredReadinessRetry.mockReset();
		testState.sponsoredReadinessStatus = "ready";
		testState.submissionOutcomeUnknown = false;
		testState.preTransferFresh = {
			fee: "0",
			isSanctioned: false,
			userExists: true,
			userHasSentTx: true,
		};
		testState.preTransferReview = {
			fee: "0",
			isSanctioned: false,
			userExists: true,
			userHasSentTx: true,
		};
		testState.preTransferInfo.mockReset();
		testState.preTransferInfo.mockImplementation(async () => testState.preTransferFresh);
		testState.preTransferRefetch.mockReset();
		testState.preTransferRefetch.mockImplementation(async () => ({
			data: testState.preTransferReview,
			isError: false,
		}));
		testState.routingResponse = { depositRoute: "bridge", withdrawalRoute: "cctp" };
		testState.routingError = false;
		testState.spotMetaError = false;
		testState.preTransferError = false;
		testState.spotBalances = [];
		testState.routingRefetch.mockReset();
		testState.routingRefetch.mockResolvedValue({
			data: { depositRoute: "bridge", withdrawalRoute: "cctp" },
			isError: false,
		});
		testState.spotMeta = {
			tokens: [{ index: 37, isCanonical: true, name: "USDC" }],
			universe: [],
		};
		testState.spotMetaRefetch.mockReset();
		testState.useDepositOptions = null;
		testState.walletIntentOverride = undefined;
		testState.walletAddress = "0x1111111111111111111111111111111111111111";
		testState.withdrawable = "10";
		testState.withdrawDraft = "2";
		testState.withdrawSubmit = null;
		testState.spotMetaRefetch.mockImplementation(async () => ({ data: testState.spotMeta, isError: false }));
		testState.fetchFreshRouting.mockImplementation(async () => {
			if (testState.freshRoutingError) throw testState.freshRoutingError;
			return testState.freshRoutingResponse;
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		await act(async () => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(I18nProvider, { i18n }, createElement(DepositModal)),
				),
			);
		});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function getGuard(method: "sendToEvmWithData" | "withdraw3") {
		const guard = testState.exchangeGuards.get(method);
		if (!guard) throw new Error(`Missing pre-execution guard for ${method}`);
		return guard;
	}

	async function rerender() {
		await act(async () => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(I18nProvider, { i18n }, createElement(DepositModal)),
				),
			);
		});
	}

	function getButton(label: string): HTMLButtonElement {
		const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
		if (!button) throw new Error(`Missing ${label} button`);
		return button;
	}

	async function submitWithdrawal() {
		await rerender();
		act(() => getButton("Set amount").click());
		await act(async () => getButton("Submit withdrawal").click());
	}

	async function expectWithdrawalErrorRetranslates(
		messageKey: keyof typeof WITHDRAWAL_MESSAGES,
		staleMessage?: string,
	) {
		await vi.waitFor(() =>
			expect(container.querySelector('[data-testid="status-description"]')?.textContent).toBe(
				WITHDRAWAL_MESSAGES[messageKey],
			),
		);
		if (staleMessage) expect(container.textContent).not.toContain(staleMessage);

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.querySelector('[data-testid="status-description"]')?.textContent).toBe(
			WITHDRAWAL_MESSAGES_AR[messageKey],
		);
		expect(container.textContent).not.toContain(WITHDRAWAL_MESSAGES[messageKey]);
		if (staleMessage) expect(container.textContent).not.toContain(staleMessage);
	}

	it.each([null, "unknown", "default", "dexAbstraction"])(
		"preserves only confirmed %s account-mode restrictions in withdrawal",
		async (mode) => {
			testState.modalOpen = true;
			testState.activeTab = "withdraw";
			testState.accountAbstraction = mode;
			await rerender();
			act(() => getButton("Set amount").click());
			expect(container.querySelector('[data-testid="withdrawal-prerequisite"]')?.textContent).toBe(
				mode === "default" || mode === "dexAbstraction" ? "Select a supported account mode before moving funds." : "",
			);
			expect(getButton("Submit withdrawal").disabled).toBe(true);
			await act(async () => getButton("Submit withdrawal").click());
			for (const mutation of testState.exchangeSdkCalls.values()) expect(mutation).not.toHaveBeenCalled();
		},
	);

	it("derives the CCTP pre-transfer target from spotMeta and checks it at the SDK boundary", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		const signal = new AbortController().signal;
		testState.exchangeSignal = signal;

		await submitWithdrawal();

		const expectedParams = {
			source: "0x1111111111111111111111111111111111111111",
			user: "0x2000000000000000000000000000000000000025",
		};
		const preTransferQueryCall = testState.infoQueryCalls.find(
			(call) => call.method === "preTransferCheck" && call.enabled,
		);
		expect(preTransferQueryCall?.params).toEqual(expectedParams);
		expect(testState.preTransferInfo).toHaveBeenCalledWith(expectedParams, signal);
		expect(testState.fetchFreshRouting).toHaveBeenCalledWith(signal);
		expect(testState.accountGuard).toHaveBeenCalledWith(signal);
		expect(testState.assertFreshGeoAllowed).toHaveBeenCalledWith(signal);
		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).toHaveBeenCalledOnce();
		expect(testState.exchangeSdkCalls.get("withdraw3")).not.toHaveBeenCalled();
	});

	it.each(["disabled", "unifiedAccount", "portfolioMargin"] as const)(
		"preserves the exact %s withdrawal balance through Max, validation and SDK submission",
		async (mode) => {
			testState.modalOpen = true;
			testState.activeTab = "withdraw";
			testState.accountAbstraction = mode;
			testState.withdrawable = "1000000000000000.999999";
			testState.spotBalances = [
				{
					coin: "USDC",
					token: 0,
					total: "1000000000000001.123455",
					hold: "0.123456",
					entryNtl: "0",
				},
			];
			testState.preTransferReview.fee = "0.25";
			testState.preTransferFresh.fee = "0.25";
			await rerender();

			const form = () => container.querySelector('[data-testid="withdraw-routing-status"]');
			expect(form()?.getAttribute("data-available")).toBe("1000000000000000.999999");
			expect(form()?.getAttribute("data-max-amount")).toBe("1000000000000000.749999");
			testState.withdrawDraft = "1000000000000000.75";
			act(() => getButton("Set amount").click());
			expect(getButton("Submit withdrawal").disabled).toBe(true);
			act(() => getButton("Submit withdrawal").click());
			expect(testState.exchangeMutations.get("sendToEvmWithData")).not.toHaveBeenCalled();

			testState.withdrawDraft = "1000000000000000.74";
			act(() => getButton("Set amount").click());
			expect(form()?.getAttribute("data-amount")).toBe("1000000000000000.74");
			expect(getButton("Submit withdrawal").disabled).toBe(false);
			await act(async () => getButton("Submit withdrawal").click());
			expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({
					amount: "1000000000000000.74",
					sourceDex: mode === "disabled" ? "" : "spot",
				}),
			);
			expect(testState.exchangeErrors.get("sendToEvmWithData")).toBeUndefined();
		},
	);

	it("does not enqueue a withdrawal after its modal lifecycle is invalidated", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		let resolveSpotMeta!: (value: { data: typeof testState.spotMeta; isError: false }) => void;
		testState.spotMetaRefetch.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveSpotMeta = resolve;
			}),
		);

		await rerender();
		act(() => getButton("Set amount").click());
		let submission!: Promise<void>;
		await act(async () => {
			if (!testState.withdrawSubmit) throw new Error("Missing withdrawal submit handler");
			submission = Promise.resolve(testState.withdrawSubmit());
			await vi.waitFor(() => expect(testState.spotMetaRefetch).toHaveBeenCalledOnce());
		});

		act(() => testState.modalOnOpenChange?.(false));
		await act(async () => {
			resolveSpotMeta({ data: testState.spotMeta, isError: false });
			await submission;
		});

		expect(testState.exchangeMutations.get("sendToEvmWithData")).not.toHaveBeenCalled();
		expect(testState.exchangeMutations.get("withdraw3")).not.toHaveBeenCalled();
		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		expect(testState.exchangeSdkCalls.get("withdraw3")).not.toHaveBeenCalled();
	});

	describe.each([
		{ route: "cctp", method: "sendToEvmWithData" },
		{ route: "bridge", method: "withdraw3" },
	] as const)("$method final execution guard", ({ route, method }) => {
		async function pauseAfterPreflight() {
			testState.modalOpen = true;
			testState.activeTab = "withdraw";
			testState.routingResponse = { depositRoute: "bridge", withdrawalRoute: route };
			testState.freshRoutingResponse = testState.routingResponse;
			let release!: () => void;
			testState.exchangeFinalWait.mockReturnValueOnce(
				new Promise<void>((resolve) => {
					release = resolve;
				}),
			);
			await rerender();
			act(() => getButton("Set amount").click());
			let submission!: Promise<void>;
			await act(async () => {
				if (!testState.withdrawSubmit) throw new Error("Missing withdrawal submit handler");
				submission = Promise.resolve(testState.withdrawSubmit());
				await vi.waitFor(() => expect(testState.exchangeFinalWait).toHaveBeenCalledOnce());
			});
			expect(testState.exchangeMutations.get(method)).toHaveBeenCalledOnce();
			expect(testState.exchangeSdkCalls.get(method)).not.toHaveBeenCalled();
			return { release, submission };
		}

		it.each([
			{ change: "unmount", code: "withdrawal-conditions-changed" },
			{ change: "tab change", code: "withdrawal-conditions-changed" },
			{ change: "identity change", code: "withdrawal-conditions-changed" },
			{ change: "balance change", code: "balance-changed" },
			{ change: "stale balance", code: "balance-unavailable" },
		] as const)("rejects $change during the final asynchronous wait", async ({ change, code }) => {
			const { release, submission } = await pauseAfterPreflight();
			if (change === "unmount") {
				act(() => root.render(null));
			} else {
				if (change === "tab change") testState.activeTab = "deposit";
				if (change === "identity change") {
					testState.walletAddress = "0x2222222222222222222222222222222222222222";
					testState.hyperliquidClientKey = testState.walletAddress;
				}
				if (change === "balance change") testState.withdrawable = "1";
				if (change === "stale balance") testState.balanceStale = true;
				await rerender();
			}
			await act(async () => {
				release();
				await submission;
			});
			expect(testState.exchangeSdkCalls.get(method)).not.toHaveBeenCalled();
			expect(testState.exchangeErrors.get(method)).toMatchObject({ code });
		});

		it("executes exactly once after the final wait if the review remains current", async () => {
			const { release, submission } = await pauseAfterPreflight();
			await rerender();
			await act(async () => {
				release();
				await submission;
			});
			expect(testState.exchangeSdkCalls.get(method)).toHaveBeenCalledOnce();
			expect(testState.exchangeErrors.get(method)).toBeUndefined();
		});

		it.each(["unifiedAccount", "portfolioMargin"] as const)(
			"rejects an account mode change to %s during the final wait",
			async (accountAbstraction) => {
				const { release, submission } = await pauseAfterPreflight();
				testState.accountAbstraction = accountAbstraction;
				await rerender();
				await act(async () => {
					release();
					await submission;
				});
				expect(testState.exchangeSdkCalls.get(method)).not.toHaveBeenCalled();
				expect(testState.exchangeErrors.get(method)).toMatchObject({ code: "withdrawal-conditions-changed" });
			},
		);

		it("renders a final guard rejection as failed and lets Retry restore the form", async () => {
			const { release, submission } = await pauseAfterPreflight();
			testState.withdrawable = "1";
			await rerender();
			await act(async () => {
				release();
				await submission;
			});
			expect(container.querySelector('[data-testid="status-heading"]')?.textContent).toBe("Withdrawal failed");
			expect(container.querySelector('[data-testid="status-description"]')?.textContent).toBe(
				WITHDRAWAL_MESSAGES.balanceChanged,
			);
			expect(container.textContent).not.toContain("Withdrawal status unknown");
			expect(testState.exchangeSdkCalls.get(method)).not.toHaveBeenCalled();

			await act(async () => getButton("Retry").click());
			expect(container.querySelector('[data-testid="status-screen"]')).toBeNull();
			expect(container.querySelector('[data-testid="withdraw-routing-status"]')).not.toBeNull();
			expect(testState.exchangeErrors.get(method)).toBeUndefined();
			expect(testState.exchangeMutations.get(method)).toHaveBeenCalledOnce();
		});

		it.each([
			{ balance: "2", cctpAllowed: false },
			{ balance: "3", cctpAllowed: true },
		])("checks the reviewed activation fee against final balance $balance", async ({ balance, cctpAllowed }) => {
			testState.preTransferReview = { ...testState.preTransferReview, fee: "1" };
			testState.preTransferFresh = { ...testState.preTransferFresh, fee: "1" };
			const { release, submission } = await pauseAfterPreflight();
			testState.withdrawable = balance;
			await rerender();
			await act(async () => {
				release();
				await submission;
			});
			const allowed = route === "bridge" || cctpAllowed;
			expect(testState.exchangeSdkCalls.get(method)).toHaveBeenCalledTimes(allowed ? 1 : 0);
			if (allowed) {
				expect(testState.exchangeErrors.get(method)).toBeUndefined();
			} else {
				expect(testState.exchangeErrors.get(method)).toMatchObject({ code: "balance-changed" });
			}
			if (route === "bridge") expect(testState.preTransferInfo).not.toHaveBeenCalled();
		});

		it("rejects a same-amount replacement at the end of the asynchronous pre-execution guard", async () => {
			testState.modalOpen = true;
			testState.activeTab = "withdraw";
			testState.routingResponse = { depositRoute: "bridge", withdrawalRoute: route };
			testState.freshRoutingResponse = testState.routingResponse;
			let finishFirst!: () => void;
			let finishSecond!: () => void;
			const mutation = testState.exchangeMutations.get(method);
			if (!mutation) throw new Error("Missing withdrawal mutation");
			mutation
				.mockImplementationOnce(
					() =>
						new Promise<void>((resolve) => {
							finishFirst = resolve;
						}),
				)
				.mockImplementationOnce(
					() =>
						new Promise<void>((resolve) => {
							finishSecond = resolve;
						}),
				);
			await rerender();
			act(() => getButton("Set amount").click());
			let firstSubmission!: Promise<void>;
			await act(async () => {
				if (!testState.withdrawSubmit) throw new Error("Missing withdrawal submit handler");
				firstSubmission = Promise.resolve(testState.withdrawSubmit());
				await vi.waitFor(() => expect(mutation).toHaveBeenCalledOnce());
			});

			let releaseGuard!: () => void;
			testState.accountGuard.mockReturnValueOnce(
				new Promise<void>((resolve) => {
					releaseGuard = resolve;
				}),
			);
			const guardResult = getGuard(method)({ amount: "2" }, new AbortController().signal).then(
				() => ({ status: "allowed" as const }),
				(error: unknown) => ({ status: "rejected" as const, error }),
			);
			await vi.waitFor(() => expect(testState.accountGuard).toHaveBeenCalledOnce());
			let secondSubmission!: Promise<void>;
			await act(async () => {
				if (!testState.withdrawSubmit) throw new Error("Missing withdrawal submit handler");
				secondSubmission = Promise.resolve(testState.withdrawSubmit());
				await vi.waitFor(() => expect(mutation).toHaveBeenCalledTimes(2));
			});
			expect(mutation.mock.calls[0]?.[0]).toEqual(mutation.mock.calls[1]?.[0]);
			releaseGuard();
			expect(await guardResult).toMatchObject({
				status: "rejected",
				error: { code: "withdrawal-conditions-changed" },
			});
			expect(testState.exchangeFinalWait).not.toHaveBeenCalled();
			await act(async () => {
				finishFirst();
				finishSecond();
				await Promise.all([firstSubmission, secondSubmission]);
			});
		});

		it("does not let a same-amount replacement review revive the old request", async () => {
			const first = await pauseAfterPreflight();
			testState.activeTab = "deposit";
			await rerender();
			testState.activeTab = "withdraw";
			await rerender();
			let releaseSecond!: () => void;
			testState.exchangeFinalWait.mockReturnValueOnce(
				new Promise<void>((resolve) => {
					releaseSecond = resolve;
				}),
			);
			let secondSubmission!: Promise<void>;
			await act(async () => {
				if (!testState.withdrawSubmit) throw new Error("Missing withdrawal submit handler");
				secondSubmission = Promise.resolve(testState.withdrawSubmit());
				await vi.waitFor(() => expect(testState.exchangeFinalWait).toHaveBeenCalledTimes(2));
			});
			expect(testState.exchangeMutations.get(method)?.mock.calls[0]?.[0]).toEqual(
				testState.exchangeMutations.get(method)?.mock.calls[1]?.[0],
			);
			await act(async () => {
				first.release();
				await first.submission;
			});
			expect(testState.exchangeSdkCalls.get(method)).not.toHaveBeenCalled();
			expect(testState.exchangeErrors.get(method)).toMatchObject({ code: "withdrawal-conditions-changed" });
			await act(async () => {
				releaseSecond();
				await secondSubmission;
			});
			expect(testState.exchangeSdkCalls.get(method)).toHaveBeenCalledOnce();
		});
	});

	it("does not enqueue a withdrawal when the signing identity changes during preflight", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		let resolveSpotMeta!: (value: { data: typeof testState.spotMeta; isError: false }) => void;
		testState.spotMetaRefetch.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveSpotMeta = resolve;
			}),
		);

		await rerender();
		act(() => getButton("Set amount").click());
		let submission!: Promise<void>;
		await act(async () => {
			if (!testState.withdrawSubmit) throw new Error("Missing withdrawal submit handler");
			submission = Promise.resolve(testState.withdrawSubmit());
			await vi.waitFor(() => expect(testState.spotMetaRefetch).toHaveBeenCalledOnce());
		});

		testState.walletAddress = "0x2222222222222222222222222222222222222222";
		testState.hyperliquidClientKey = testState.walletAddress;
		await rerender();
		await act(async () => {
			resolveSpotMeta({ data: testState.spotMeta, isError: false });
			await submission;
		});

		expect(testState.exchangeMutations.get("sendToEvmWithData")).not.toHaveBeenCalled();
		expect(testState.exchangeMutations.get("withdraw3")).not.toHaveBeenCalled();
	});

	it("does not start a deposit when the signing identity changes during routing preflight", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.emailAddress = "trader@example.com";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		let resolveRouting!: (value: { depositRoute: "cctp"; withdrawalRoute: "cctp" }) => void;
		testState.fetchFreshRouting.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveRouting = resolve;
			}),
		);

		await rerender();
		act(() => getButton("Deposit 10 USDC").click());
		await vi.waitFor(() => expect(testState.fetchFreshRouting).toHaveBeenCalledOnce());

		testState.walletAddress = "0x2222222222222222222222222222222222222222";
		testState.hyperliquidClientKey = testState.walletAddress;
		await rerender();
		await act(async () => {
			resolveRouting({ depositRoute: "cctp", withdrawalRoute: "cctp" });
			await Promise.resolve();
		});

		expect(testState.deposit).not.toHaveBeenCalled();
	});

	it("rejects a CCTP fee change at the SDK boundary and retranslates the cached feedback", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.cctpWithdrawalFeeRefetch
			.mockResolvedValueOnce({ data: "1", isError: false })
			.mockResolvedValueOnce({ data: "2", isError: false });

		await submitWithdrawal();

		expect(testState.exchangeMutations.get("sendToEvmWithData")).toHaveBeenCalledOnce();
		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		await expectWithdrawalErrorRetranslates("feeChanged");
	});

	it("rejects an unavailable CCTP fee at the SDK boundary", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.cctpWithdrawalFeeRefetch
			.mockResolvedValueOnce({ data: "1", isError: false })
			.mockResolvedValueOnce({ data: undefined, isError: true });

		await submitWithdrawal();

		expect(testState.exchangeMutations.get("sendToEvmWithData")).toHaveBeenCalledOnce();
		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		await expectWithdrawalErrorRetranslates("feeUnavailable");
	});

	it("keeps an ambiguous Privy identity out of both embedded and external deposit execution", async () => {
		testState.modalOpen = true;
		testState.emailAddress = "trader@example.com";
		testState.walletIntentOverride = "ambiguous";
		testState.depositAvailable = true;

		await rerender();
		expect(testState.useDepositOptions).toMatchObject({ balanceEnabled: false });
		expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Submit deposit")).toBe(
			false,
		);
		expect(testState.deposit).not.toHaveBeenCalled();
	});

	it("fails the withdrawal SDK boundary closed when the fresh geo check is unavailable", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.assertFreshGeoAllowed.mockRejectedValueOnce(
			new Error("Unable to verify regional availability. This funds action was not submitted."),
		);

		await submitWithdrawal();

		expect(testState.assertFreshGeoAllowed).toHaveBeenCalledOnce();
		expect(testState.exchangeMutations.get("sendToEvmWithData")).toHaveBeenCalledOnce();
		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
	});

	it("retranslates a cached withdrawal-route availability guard after an en-to-ar switch", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.fetchFreshRouting
			.mockReset()
			.mockResolvedValueOnce({ depositRoute: "bridge", withdrawalRoute: "cctp" })
			.mockRejectedValueOnce(new Error("raw route HTTP failure"));

		await submitWithdrawal();

		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		await expectWithdrawalErrorRetranslates("routeUnavailable", "raw route HTTP failure");
	});

	it("retranslates a cached withdrawal-route change guard after an en-to-ar switch", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.fetchFreshRouting
			.mockReset()
			.mockResolvedValueOnce({ depositRoute: "bridge", withdrawalRoute: "cctp" })
			.mockResolvedValueOnce({ depositRoute: "bridge", withdrawalRoute: "bridge" });

		await submitWithdrawal();

		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		await expectWithdrawalErrorRetranslates("routeChanged");
	});

	it("retranslates a cached account-mode guard after an en-to-ar switch", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.accountGuard.mockRejectedValueOnce(new AccountAbstractionExecutionError("changed"));

		await submitWithdrawal();

		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		await expectWithdrawalErrorRetranslates("accountModeChanged");
	});

	it("retranslates a cached geo guard after an en-to-ar switch", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.assertFreshGeoAllowed.mockRejectedValueOnce(new FundsActionGeoExecutionError("unavailable"));

		await submitWithdrawal();

		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		await expectWithdrawalErrorRetranslates("geoUnavailable");
	});

	it.each([
		{
			messageKey: "preTransferChanged",
			name: "activation fee change",
			prepare: () => {
				testState.preTransferFresh = { ...testState.preTransferFresh, fee: "0.5" };
			},
		},
		{
			messageKey: "preTransferSanctioned",
			name: "sanctions change",
			prepare: () => {
				testState.preTransferFresh = { ...testState.preTransferFresh, isSanctioned: true };
			},
		},
		{
			messageKey: "preTransferUnavailable",
			name: "eligibility request failure",
			prepare: () => {
				testState.preTransferInfo.mockRejectedValueOnce(new Error("raw eligibility HTTP failure"));
			},
		},
	] as const)(
		"retranslates a cached pre-transfer $name guard after an en-to-ar switch",
		async ({ messageKey, prepare }) => {
			testState.modalOpen = true;
			testState.activeTab = "withdraw";
			prepare();

			await submitWithdrawal();

			expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
			await expectWithdrawalErrorRetranslates(messageKey);
		},
	);

	it.each([
		{
			messageKey: "balanceUnavailable",
			name: "stale",
			update: () => {
				testState.balanceStale = true;
			},
		},
		{
			messageKey: "balanceChanged",
			name: "changed",
			update: () => {
				testState.withdrawable = "1";
			},
		},
	] as const)("retranslates a cached $name balance guard after an en-to-ar switch", async ({ messageKey, update }) => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		let releaseAccountGuard!: () => void;
		const accountGuard = new Promise<void>((resolve) => {
			releaseAccountGuard = resolve;
		});
		testState.accountGuard.mockReturnValueOnce(accountGuard);

		await rerender();
		act(() => getButton("Set amount").click());
		let submission!: Promise<void>;
		await act(async () => {
			if (!testState.withdrawSubmit) throw new Error("Missing withdrawal submit handler");
			submission = Promise.resolve(testState.withdrawSubmit());
			await vi.waitFor(() => expect(testState.accountGuard).toHaveBeenCalledOnce());
		});

		update();
		await rerender();
		await act(async () => {
			releaseAccountGuard();
			await submission;
		});

		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		await expectWithdrawalErrorRetranslates(messageKey);
	});

	it("preserves a raw exchange error across an en-to-ar switch", async () => {
		const rawExchangeMessage = "Hyperliquid SDK rejected withdrawal TEST-RAW";
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.exchangeSdkCalls.get("sendToEvmWithData")?.mockRejectedValueOnce(new Error(rawExchangeMessage));

		await submitWithdrawal();

		await vi.waitFor(() =>
			expect(container.querySelector('[data-testid="status-description"]')?.textContent).toBe(rawExchangeMessage),
		);
		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.querySelector('[data-testid="status-description"]')?.textContent).toBe(rawExchangeMessage);
	});

	it("does not expose cached Spot funds when the balance snapshot is stale", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.balanceStale = true;

		await rerender();

		expect(
			container.querySelector('[data-testid="withdraw-routing-status"]')?.getAttribute("data-show-spot-funds-notice"),
		).toBe("false");
	});

	it("keeps activation fees and pre-transfer checks out of the legacy withdrawal route", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.routingResponse = { depositRoute: "bridge", withdrawalRoute: "bridge" };
		testState.freshRoutingResponse = { depositRoute: "bridge", withdrawalRoute: "bridge" };
		testState.preTransferReview = { ...testState.preTransferReview, fee: "4" };

		await submitWithdrawal();

		const form = container.querySelector('[data-testid="withdraw-routing-status"]');
		expect(form?.getAttribute("data-activation-fee")).toBe("0");
		expect(form?.getAttribute("data-max-amount")).toBe("10");
		expect(testState.preTransferRefetch).not.toHaveBeenCalled();
		expect(testState.preTransferInfo).not.toHaveBeenCalled();
		expect(testState.exchangeSdkCalls.get("withdraw3")).toHaveBeenCalledOnce();
		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
	});

	it("fails the legacy withdrawal SDK boundary closed when the fresh geo check is unavailable", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.routingResponse = { depositRoute: "bridge", withdrawalRoute: "bridge" };
		testState.freshRoutingResponse = { depositRoute: "bridge", withdrawalRoute: "bridge" };
		testState.assertFreshGeoAllowed.mockRejectedValueOnce(
			new Error("Unable to verify regional availability. This funds action was not submitted."),
		);

		await submitWithdrawal();

		expect(testState.assertFreshGeoAllowed).toHaveBeenCalledOnce();
		expect(testState.exchangeMutations.get("withdraw3")).toHaveBeenCalledOnce();
		expect(testState.exchangeSdkCalls.get("withdraw3")).not.toHaveBeenCalled();
	});

	it("rejects a queue-boundary activation fee change before calling the exchange SDK", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.preTransferFresh = { ...testState.preTransferFresh, fee: "0.5" };

		await submitWithdrawal();

		expect(testState.exchangeMutations.get("sendToEvmWithData")).toHaveBeenCalledOnce();
		expect(testState.preTransferInfo).toHaveBeenCalledOnce();
		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		expect(
			queryClient.getQueryData([
				"hl",
				"Mainnet",
				"preTransferCheck",
				{
					user: "0x2000000000000000000000000000000000000025",
					source: "0x1111111111111111111111111111111111111111",
				},
			]),
		).toEqual(testState.preTransferFresh);
	});

	it("rejects a queue-boundary sanctions flip before calling the exchange SDK", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.preTransferFresh = { ...testState.preTransferFresh, isSanctioned: true };

		await submitWithdrawal();

		expect(testState.exchangeMutations.get("sendToEvmWithData")).toHaveBeenCalledOnce();
		expect(testState.preTransferInfo).toHaveBeenCalledOnce();
		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
	});

	it("rejects a direct legacy SDK-boundary invocation without an active reviewed submission", async () => {
		await expect(getGuard("withdraw3")({ amount: "1" }, new AbortController().signal)).rejects.toThrow(
			"Withdrawal conditions changed",
		);
		expect(testState.fetchFreshRouting).not.toHaveBeenCalled();
	});

	it("surfaces a final deposit-route request failure instead of leaving a ready button silently active", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.freshRoutingError = new Error("transport failed");
		await rerender();

		await act(async () => getButton("Submit deposit").click());

		expect(testState.deposit).not.toHaveBeenCalled();
		expect(container.querySelector('[data-testid="deposit-routing-status"]')?.getAttribute("data-status")).toBe(
			"error",
		);

		await act(async () => getButton("Retry deposit route").click());
		expect(container.querySelector('[data-testid="deposit-routing-status"]')?.getAttribute("data-status")).toBe(
			"ready",
		);
	});

	it("shows and retranslates a deposit-route change that blocks the reviewed submission", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.freshRoutingResponse = { depositRoute: "bridge", withdrawalRoute: "cctp" };
		await rerender();

		await act(async () => getButton("Submit deposit").click());

		expect(testState.deposit).not.toHaveBeenCalled();
		expect(container.querySelector('[data-testid="deposit-routing-preflight-error"]')?.textContent).toBe(
			WITHDRAWAL_MESSAGES.depositRouteChanged,
		);

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.querySelector('[data-testid="deposit-routing-preflight-error"]')?.textContent).toBe(
			WITHDRAWAL_MESSAGES_AR.depositRouteChanged,
		);
	});

	it.each([true, false])("retries a changed deposit route with a successful response: %s", async (successful) => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.freshRoutingResponse = { depositRoute: "bridge", withdrawalRoute: "cctp" };
		await rerender();
		await act(async () => getButton("Submit deposit").click());
		expect(container.querySelector('[data-testid="deposit-routing-preflight-error"]')?.textContent).toBe(
			WITHDRAWAL_MESSAGES.depositRouteChanged,
		);
		testState.routingRefetch.mockResolvedValueOnce(
			successful ? { data: testState.freshRoutingResponse, isError: false } : { data: undefined, isError: true },
		);

		await act(async () => getButton("Retry deposit route").click());
		expect(testState.routingRefetch).toHaveBeenCalledOnce();
		expect(testState.deposit).not.toHaveBeenCalled();
		const error = container.querySelector('[data-testid="deposit-routing-preflight-error"]');
		const form = container.querySelector('[data-testid="deposit-routing-status"]');
		if (successful) {
			expect(error).toBeNull();
			expect(form?.getAttribute("data-status")).toBe("ready");
		} else {
			expect(error?.textContent).toBe(
				"Unable to verify the current Hyperliquid deposit route. Deposit was not submitted.",
			);
			expect(form?.getAttribute("data-status")).toBe("error");
		}
	});

	it("passes the amount-independent Circle forwarding fee to an empty external deposit form", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.cctpDepositFeeCalculation = null;
		testState.cctpDepositFeeCalls.length = 0;

		await rerender();

		const depositForm = container.querySelector('[data-testid="deposit-routing-status"]');
		expect(depositForm?.getAttribute("data-cctp-fee")).toBe("0.2");
		expect(testState.cctpDepositFeeCalls).toContainEqual({
			amountRaw: undefined,
			enabled: true,
			isTestnet: false,
		});
	});

	it("keeps the deposit title accessible but visually hides it from the form", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";

		await rerender();

		const depositTitle = container.querySelector("h2");
		expect(depositTitle?.textContent).toBe("Deposit");
		expect(depositTitle?.className).toContain("sr-only");

		testState.activeTab = "withdraw";
		await rerender();

		const withdrawTitle = container.querySelector("h2");
		expect(withdrawTitle?.textContent).toBe("Withdraw");
		expect(withdrawTitle?.className).not.toContain("sr-only");
	});

	it("queries the shared Circle fee cache for the embedded wallet's current sponsored deposit amount", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.emailAddress = "trader@example.com";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.cctpDepositFeeCalls.length = 0;

		await rerender();

		expect(testState.cctpDepositFeeCalls).toContainEqual({
			amountRaw: 10_000_000n,
			enabled: true,
			isTestnet: false,
		});
	});

	it("prefetches the current Circle fee quote before the embedded wallet receives USDC", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.emailAddress = "trader@example.com";
		testState.depositMaxRaw = 0n;
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.cctpDepositFeeCalls.length = 0;

		await rerender();

		expect(testState.cctpDepositFeeCalls).toContainEqual({
			amountRaw: 0n,
			enabled: true,
			isTestnet: false,
		});
	});

	it("withholds the embedded funding address and fee preflight until the Smart Wallet is ready", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.emailAddress = "trader@example.com";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.sponsoredReadinessFailure = "paymaster-unavailable";
		testState.sponsoredReadinessStatus = "error";
		testState.cctpDepositFeeCalls.length = 0;

		await rerender();

		const depositForm = container.querySelector('[data-testid="deposit-routing-status"]');
		expect(depositForm?.getAttribute("data-readiness-status")).toBe("error");
		expect(depositForm?.hasAttribute("data-funding-address")).toBe(false);
		expect(testState.cctpDepositFeeCalls).toContainEqual({
			amountRaw: 10_000_000n,
			enabled: false,
			isTestnet: false,
		});
		expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Deposit 10 USDC")).toBe(
			false,
		);
	});

	it("withholds a programmatically opened funding address when deposit capability is unavailable", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.emailAddress = "trader@example.com";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.depositAvailable = false;
		testState.depositUnavailableReason = "Unable to verify regional availability.";
		testState.cctpDepositFeeCalls.length = 0;

		await rerender();

		const depositForm = container.querySelector('[data-testid="deposit-routing-status"]');
		expect(depositForm?.hasAttribute("data-funding-address")).toBe(false);
		expect(testState.cctpDepositFeeCalls).toContainEqual({
			amountRaw: 10_000_000n,
			enabled: false,
			isTestnet: false,
		});

		await act(async () => getButton("Deposit 10 USDC").click());
		expect(testState.deposit).not.toHaveBeenCalled();
	});

	it("submits a mainnet sponsored deposit only after the user explicitly confirms the reviewed full balance", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.emailAddress = "trader@example.com";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.freshRoutingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };

		await rerender();

		expect(testState.deposit).not.toHaveBeenCalled();
		await act(async () => getButton("Deposit 10 USDC").click());

		expect(testState.deposit).toHaveBeenCalledOnce();
		expect(testState.deposit).toHaveBeenCalledWith("10", {
			expectedBalanceRaw: 10_000_000n,
			expectedCctpMaxFeeRaw: 200_000n,
		});
	});

	it("surfaces a final withdrawal-route request failure without entering either mutation", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.freshRoutingError = new Error("transport failed");
		await rerender();

		act(() => getButton("Set amount").click());
		await act(async () => getButton("Submit withdrawal").click());

		expect(testState.exchangeMutations.get("sendToEvmWithData")).not.toHaveBeenCalled();
		expect(testState.exchangeMutations.get("withdraw3")).not.toHaveBeenCalled();
		expect(container.querySelector('[data-testid="withdraw-routing-status"]')?.getAttribute("data-status")).toBe(
			"error",
		);
		expect(
			container.querySelector('[data-testid="withdraw-routing-status"]')?.getAttribute("data-preflight-failed"),
		).toBe("true");

		await act(async () => getButton("Retry withdrawal route").click());
		expect(container.querySelector('[data-testid="withdraw-routing-status"]')?.getAttribute("data-status")).toBe(
			"ready",
		);
		expect(
			container.querySelector('[data-testid="withdraw-routing-status"]')?.getAttribute("data-preflight-failed"),
		).toBe("false");
	});

	it.each(["spotMetaError", "preTransferError", "cctpWithdrawalFeeError"] as const)(
		"keeps passive %s quiet while retaining the SDK gate",
		async (field) => {
			testState.modalOpen = true;
			testState.activeTab = "withdraw";
			testState[field] = true;
			await rerender();
			act(() => getButton("Set amount").click());
			expect(container.querySelector('[data-testid="withdrawal-prerequisite"]')?.textContent).toBe("");
			expect(getButton("Submit withdrawal").disabled).toBe(true);
			await act(async () => getButton("Submit withdrawal").click());
			expect(testState.exchangeMutations.get("sendToEvmWithData")).not.toHaveBeenCalled();
			testState[field] = false;
			await rerender();
			expect(getButton("Submit withdrawal").disabled).toBe(false);
		},
	);

	it("does not classify a passive routing error as a failed withdrawal attempt", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.routingError = true;
		await rerender();
		expect(
			container.querySelector('[data-testid="withdraw-routing-status"]')?.getAttribute("data-preflight-failed"),
		).toBe("false");
		expect(getButton("Submit withdrawal").disabled).toBe(true);
	});

	it.each([
		["spotMetaRefetch", WITHDRAWAL_MESSAGES.preTransferUnavailable],
		["preTransferRefetch", WITHDRAWAL_MESSAGES.preTransferUnavailable],
		["cctpWithdrawalFeeRefetch", WITHDRAWAL_MESSAGES.feeUnavailable],
	] as const)("retains a requested %s failure and clears it after a successful retry", async (field, expected) => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState[field].mockResolvedValueOnce({ data: undefined, isError: true });
		await rerender();
		act(() => getButton("Set amount").click());
		await act(async () => getButton("Submit withdrawal").click());
		expect(container.querySelector('[data-testid="withdrawal-prerequisite"]')?.textContent).toBe(expected);
		expect(testState.exchangeMutations.get("sendToEvmWithData")).not.toHaveBeenCalled();
		expect(testState.exchangeMutations.get("withdraw3")).not.toHaveBeenCalled();
		await act(async () => getButton("Retry withdrawal route").click());
		expect(container.querySelector('[data-testid="withdrawal-prerequisite"]')?.textContent).toBe("");
	});

	it("retains a thrown preflight failure through passive balance recovery and retranslates it", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.spotMetaRefetch.mockRejectedValueOnce(new Error("private transport detail"));
		await rerender();
		act(() => getButton("Set amount").click());
		await act(async () => getButton("Submit withdrawal").click());
		expect(container.querySelector('[data-testid="withdrawal-prerequisite"]')?.textContent).toBe(
			WITHDRAWAL_MESSAGES.preTransferUnavailable,
		);
		expect(container.textContent).not.toContain("private transport detail");
		expect(testState.exchangeMutations.get("sendToEvmWithData")).not.toHaveBeenCalled();
		testState.balanceStale = true;
		await rerender();
		expect(container.querySelector('[data-testid="withdrawal-prerequisite"]')?.textContent).toBe(
			WITHDRAWAL_MESSAGES.preTransferUnavailable,
		);
		await act(async () => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.querySelector('[data-testid="withdrawal-prerequisite"]')?.textContent).toBe(
			WITHDRAWAL_MESSAGES_AR.preTransferUnavailable,
		);
		const originalWallet = testState.walletAddress;
		testState.walletAddress = "0x2222222222222222222222222222222222222222";
		await rerender();
		expect(container.querySelector('[data-testid="withdrawal-prerequisite"]')?.textContent).toBe("");
		testState.walletAddress = originalWallet;
		await rerender();
		expect(container.querySelector('[data-testid="withdrawal-prerequisite"]')?.textContent).toBe("");
	});

	it.each(["rejected", "error result"] as const)(
		"ignores an old Retry %s after closing and reopening the same withdrawal context",
		async (failure) => {
			testState.modalOpen = true;
			testState.activeTab = "withdraw";
			let finish!: () => void;
			testState.spotMetaRefetch.mockReturnValueOnce(
				new Promise((resolve, reject) => {
					finish = () =>
						failure === "rejected"
							? reject(new Error("old retry failed"))
							: resolve({ data: undefined, isError: true });
				}),
			);
			await rerender();
			await act(async () => getButton("Retry withdrawal route").click());
			expect(testState.spotMetaRefetch).toHaveBeenCalledOnce();
			testState.modalOpen = false;
			await rerender();
			testState.modalOpen = true;
			await rerender();
			await act(async () => finish());
			expect(container.querySelector('[data-testid="withdrawal-prerequisite"]')?.textContent).toBe("");
			expect(
				container.querySelector('[data-testid="withdraw-routing-status"]')?.getAttribute("data-preflight-failed"),
			).toBe("false");
			expect(testState.exchangeMutations.get("sendToEvmWithData")).not.toHaveBeenCalled();
			expect(testState.exchangeMutations.get("withdraw3")).not.toHaveBeenCalled();
		},
	);

	it("keeps the latest Retry result when an older request fails afterward", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		let rejectFirst!: (error: Error) => void;
		testState.spotMetaRefetch.mockReturnValueOnce(
			new Promise((_resolve, reject) => {
				rejectFirst = reject;
			}),
		);
		await rerender();
		await act(async () => getButton("Retry withdrawal route").click());
		await act(async () => getButton("Retry withdrawal route").click());
		expect(testState.spotMetaRefetch).toHaveBeenCalledTimes(2);
		await act(async () => rejectFirst(new Error("old retry failed")));
		expect(container.querySelector('[data-testid="withdrawal-prerequisite"]')?.textContent).toBe("");
		expect(testState.exchangeMutations.get("sendToEvmWithData")).not.toHaveBeenCalled();
	});

	it("retains an explicit Retry query rejection instead of rejecting its event handler", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.spotMetaRefetch.mockRejectedValueOnce(new Error("transport unavailable"));
		await rerender();
		await act(async () => getButton("Retry withdrawal route").click());
		expect(container.querySelector('[data-testid="withdrawal-prerequisite"]')?.textContent).toBe(
			WITHDRAWAL_MESSAGES.preTransferUnavailable,
		);
		expect(testState.exchangeMutations.get("sendToEvmWithData")).not.toHaveBeenCalled();
	});

	it("renders a localized definitive source failure as failed without parsing its wording", async () => {
		testState.modalOpen = true;
		testState.depositStatus = "error";
		testState.depositHash = `0x${"1".repeat(64)}`;
		testState.depositExecutionRoute = "cctp";
		testState.depositError = new DefinitiveDepositSourceFailureError(
			"source-transaction-reverted",
			"交易已在 Arbitrum 上回滚",
		);

		await rerender();

		expect(container.querySelector('[data-testid="status-heading"]')?.textContent).toBe("Deposit failed");
		expect(container.querySelector('[data-testid="status-description"]')?.textContent).toBe("交易已在 Arbitrum 上回滚");
	});

	it("retranslates a stored deposit-route error after the locale changes", async () => {
		testState.modalOpen = true;
		testState.depositStatus = "error";
		testState.depositError = new UsdcDepositRouteError("changed");

		await rerender();
		expect(container.querySelector('[data-testid="status-description"]')?.textContent).toBe(
			WITHDRAWAL_MESSAGES.depositRouteChanged,
		);

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.querySelector('[data-testid="status-description"]')?.textContent).toBe(
			WITHDRAWAL_MESSAGES_AR.depositRouteChanged,
		);
	});

	it("does not infer a definitive outcome from an unstructured error message", async () => {
		testState.modalOpen = true;
		testState.depositStatus = "error";
		testState.depositHash = `0x${"2".repeat(64)}`;
		testState.depositExecutionRoute = "cctp";
		testState.depositError = new Error("Transaction reverted on Arbitrum");

		await rerender();

		expect(container.querySelector('[data-testid="status-heading"]')?.textContent).toBe("Deposit status unknown");
	});

	it("does not offer a retry when a sponsored submission may have reached the bundler without returning a hash", async () => {
		testState.modalOpen = true;
		testState.depositStatus = "error";
		testState.depositHash = undefined;
		testState.depositExecutionRoute = "cctp";
		testState.depositError = new Error("Bundler response was interrupted");
		testState.submissionOutcomeUnknown = true;

		await rerender();

		expect(container.querySelector('[data-testid="status-heading"]')?.textContent).toBe("Deposit status unknown");
		expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "Retry")).toBe(
			false,
		);
	});
});
