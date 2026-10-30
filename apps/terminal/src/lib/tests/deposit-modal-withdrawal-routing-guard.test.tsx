// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { ApiRequestError, HttpRequestError } from "@nktkas/hyperliquid";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ButtonHTMLAttributes, createElement, type ReactNode, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DepositModalHost } from "@/components/trade/components/deposit-modal-host";
import { renderFundsModalBackButton } from "@/components/trade/components/funds-modal-back-button";
import { AccountAbstractionExecutionError } from "@/hooks/trade/use-account-abstraction-guard";
import { FundsActionGeoExecutionError } from "@/hooks/trade/use-funds-action-availability";
import { UsdcDepositRouteError } from "@/hooks/trade/use-usdc-routing";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
import { DefinitiveDepositSourceFailureError } from "@/lib/hyperliquid/deposit-source-error";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import { unknownStatusToastIcon } from "./harness/status-glyph";

const WITHDRAWAL_MESSAGES = {
	accountModeChanged: "Account mode changed before the request was submitted. Review balances and try again.",
	balanceChanged: "Balance changed before submission. Review the updated balance and try again.",
	balanceUnavailable: "Balance data is unavailable. Try again after the connection recovers.",
	depositRouteChanged: "The Hyperliquid deposit route changed before signing. Review the updated route and retry.",
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
	feeUnavailable: "تعذر تحميل رسوم السحب الحالية عبر CCTP.",
	geoUnavailable: "تعذّر التحقق من التوفر في منطقتك. لم يتم إرسال عملية إدارة الأموال هذه.",
	preTransferChanged: "تغيرت رسوم تفعيل الحساب قبل التوقيع. راجع الرسوم المحدّثة وحاول مرة أخرى.",
	preTransferSanctioned: "عمليات السحب غير متاحة لهذا العنوان.",
	preTransferUnavailable: "تعذر التحقق من أهلية السحب. لم يتم إرسال الطلب.",
	routeChanged: "تغيّر مسار السحب في Hyperliquid. راجع المسار المحدّث والرسوم المحدّثة، ثم أرسل الطلب مرة أخرى.",
	routeUnavailable: "تعذّر التحقق من مسار السحب الحالي في Hyperliquid.",
};

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMocks }));
const closeDepositModal = vi.hoisted(() => vi.fn());
const resetDeposit = vi.hoisted(() => vi.fn());
const warmPrivyFiatFundingHost = vi.hoisted(() => vi.fn());

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
	renderListeners: new Set<() => void>(),
	renderVersion: 0,
	formatLocale: "en-US",
	depositExecutionAmount: null as string | null,
	accountGuard: vi.fn(),
	accountAbstraction: "disabled" as string | null,
	activeTab: "deposit" as "deposit" | "withdraw",
	cctpDepositFeeCalculation: { maxFeeRaw: 200_000n, netAmountRaw: 4_800_000n } as {
		maxFeeRaw: bigint;
		netAmountRaw: bigint;
	} | null,
	cctpDepositBelowMinimumRaw: null as bigint | null,
	cctpDepositRefetchForwardFeeRaw: 200_000n,
	cctpDepositFeeCalls: [] as Array<{ amountRaw: bigint | undefined; enabled: boolean; isTestnet: boolean }>,
	cctpWithdrawalFee: "1",
	cctpWithdrawalFeeError: false,
	cctpWithdrawalFeeRefetch: vi.fn(),
	depositAvailable: true,
	depositUnavailableReason: null as string | null,
	deposit: vi.fn(),
	refreshDepositBalance: vi.fn<() => Promise<bigint | undefined>>(),
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
	cctpRecoveryRecord: null as null | { sourceHash: `0x${string}` },
	fiatFlags: { mainnet: false, testnet: false },
	isTestnet: false,
	fiatOffer: null as null | { walletKind: "embedded" | "external"; disabled: boolean; start: ReturnType<typeof vi.fn> },
	fiatOfferOptions: null as null | {
		enabled: boolean;
		available: boolean;
		onBeforeStart: () => void;
	},
	networkSwitchPending: false,
	exchangeGuards: new Map<string, ((params?: unknown, signal?: AbortSignal) => Promise<void>) | undefined>(),
	exchangeFinalWait: vi.fn(),
	exchangeErrors: new Map<string, unknown>(),
	exchangePending: new Set<string>(),
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
	modalHeader: null as HTMLElement | null,
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
	walletProviderError: null as Error | null,
	walletProviderStatus: "idle" as "idle" | "loading" | "ready" | "error",
	withdrawable: "10",
	withdrawDraft: "2",
	withdrawSubmit: null as null | (() => Promise<void> | void),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@sairn/ui", async (importOriginal) => ({
	Button: ({ children, disabled, onClick }: ButtonHTMLAttributes<HTMLButtonElement>) =>
		createElement("button", { disabled, onClick, type: "button" }, children),
	ButtonIcon: (await importOriginal<typeof import("@sairn/ui")>()).ButtonIcon,
	ModalContent: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
	ModalHeader: ({ children }: { children?: ReactNode }) =>
		createElement(
			"div",
			{
				ref: (node: HTMLElement | null) => {
					testState.modalHeader = node;
				},
			},
			children,
		),
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
			belowMinimumRaw: testState.cctpDepositBelowMinimumRaw,
			data: { fastAllowanceRaw: 100_000_000n, feeQuote },
			hasSufficientFastAllowance: true,
			isError: false,
			isLoading: false,
			refetch: vi.fn().mockResolvedValue({
				data: {
					fastAllowanceRaw: 100_000_000n,
					feeQuote: {
						...feeQuote,
						forwardFeeRaw: { ...feeQuote.forwardFeeRaw, med: testState.cctpDepositRefetchForwardFeeRaw },
					},
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
	useCctpDepositTracking: () => ({
		data: undefined,
		isError: false,
		recoveryRecord: testState.cctpRecoveryRecord,
	}),
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
			isPending: testState.exchangePending.has(method),
			isSuccess: false,
			mutateAsync,
			reset: vi.fn(),
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
			refreshBalance: testState.refreshDepositBalance,
			deposit: testState.deposit,
			error: testState.depositError,
			executionAmount: testState.depositExecutionAmount,
			executionRoute: testState.depositExecutionRoute,
			hash: testState.depositHash,
			maxAmount: "10",
			maxDepositRaw: testState.depositMaxRaw,
			networkName: "Arbitrum",
			reset: resetDeposit,
			sponsoredCctpEnabled: true,
			sponsoredCctpReadiness: {
				failure: testState.sponsoredReadinessFailure,
				retry: testState.sponsoredReadinessRetry,
				status: testState.sponsoredReadinessStatus,
			},
			status: testState.depositStatus,
			validate: () => ({ error: null, valid: true }),
			walletProviderError: testState.walletProviderError,
			walletProviderStatus: testState.walletProviderStatus,
			walletResponseDelayed: false,
			networkSwitchPending: testState.networkSwitchPending,
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
	useDepositModalActions: () => ({ close: closeDepositModal }),
	useDepositModalOpen: () => testState.modalOpen,
	useDepositModalTab: () => testState.activeTab,
	useTransferModalActions: () => ({ open: vi.fn() }),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => testState.formatLocale,
	useIsTestnet: () => testState.isTestnet,
}));

vi.mock("@/config/privy-fiat-funding", () => ({
	isPrivyFiatFundingEnabled: (isTestnet: boolean) => testState.fiatFlags[isTestnet ? "testnet" : "mainnet"],
}));

vi.mock("@/hooks/trade/use-privy-fiat-funding-offer", () => ({
	usePrivyFiatFundingOffer: (options: { enabled: boolean; available: boolean; onBeforeStart: () => void }) => {
		testState.fiatOfferOptions = options;
		return testState.fiatOffer;
	},
}));

vi.mock("@/lib/trade/privy-fiat-funding-launch", () => ({ warmPrivyFiatFundingHost }));

// The host memoises the lazy body, so a re-render of the test root no longer reaches it. The stubs
// below read `testState` during render; this wrapper subscribes the real body to `rerender()`.
vi.mock("@/components/trade/components/lazy-global-modals", async () => {
	const { DepositModal } = await import("@/components/trade/tradebox/deposit-modal");
	return {
		DepositModal: function RerenderableDepositModal(props: Parameters<typeof DepositModal>[0]) {
			useSyncExternalStore(
				(listener) => {
					testState.renderListeners.add(listener);
					return () => testState.renderListeners.delete(listener);
				},
				() => testState.renderVersion,
			);
			return createElement(DepositModal, props);
		},
	};
});

vi.mock("@/components/trade/components/pending-action-modal", () => ({
	PendingActionModal: ({ children, onOpenChange }: { children?: ReactNode; onOpenChange: (open: boolean) => void }) => {
		testState.modalOnOpenChange = onOpenChange;
		return createElement("div", null, children);
	},
}));

vi.mock("@/components/trade/tradebox/deposit/deposit-form", () => ({
	DepositForm: ({
		onAmountChange,
		onRetryRouting,
		onRetryData,
		preflightError,
		isPending,
		balanceStatus,
		onSubmit,
		routingPreflightError,
		routingStatus,
		usesFundingAddressFlow,
		fundingAddress,
		cctpFee,
		sponsoredCctpReadiness,
		amountError,
		minimumDepositRaw,
		belowMinimumDepositRaw,
		validation,
	}: {
		onAmountChange: (amount: string) => void;
		amountError?: string | null;
		minimumDepositRaw: bigint | null;
		belowMinimumDepositRaw: bigint | null;
		validation: { valid: boolean; error: string | null };
		cctpFee?: string | null;
		fundingAddress?: string;
		onRetryRouting: () => void;
		onRetryData: () => void;
		preflightError: string | null;
		isPending: boolean;
		balanceStatus: string;
		onSubmit: () => void;
		routingPreflightError?: string | null;
		routingStatus: string;
		sponsoredCctpReadiness: { status: string };
		usesFundingAddressFlow: boolean;
	}) =>
		createElement(
			"div",
			{
				"data-cctp-fee": cctpFee,
				"data-amount-error": amountError ?? undefined,
				"data-minimum": minimumDepositRaw?.toString(),
				"data-below-minimum": belowMinimumDepositRaw?.toString(),
				"data-valid": validation.valid,
				"data-is-pending": isPending,
				"data-balance-status": balanceStatus,
				"data-funding-address": fundingAddress,
				"data-readiness-status": sponsoredCctpReadiness.status,
				"data-testid": "deposit-routing-status",
				"data-status": routingStatus,
			},
			createElement("p", { "data-testid": "deposit-data-error" }, preflightError),
			createElement("button", { onClick: () => onAmountChange("0.4"), type: "button" }, "Set deposit amount"),
			createElement("button", { onClick: onRetryData, type: "button" }, "Retry deposit data"),
			routingPreflightError
				? createElement("p", { "data-testid": "deposit-routing-preflight-error", role: "alert" }, routingPreflightError)
				: null,
			!usesFundingAddressFlow ? createElement("button", { onClick: onSubmit, type: "button" }, "Submit deposit") : null,
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
		destination,
		destinationError,
		destinationRequired,
		maxAmount,
		onAmountChange,
		onDestinationChange,
		onRetryPrerequisites,
		onSubmit,
		routeFee,
		routingStatus,
		routingPreflightFailed,
		showSpotFundsNotice,
		prerequisiteError,
		canSubmit,
		validation,
	}: {
		prerequisiteError: string | null;
		canSubmit: boolean;
		validation: { valid: boolean; error: string | null };
		activationFee: string;
		amount: string;
		available: string;
		destination: string;
		destinationError: string | null;
		destinationRequired: boolean;
		maxAmount: string;
		onAmountChange: (amount: string) => void;
		onDestinationChange: (destination: string) => void;
		onRetryPrerequisites: () => void;
		onSubmit: () => void;
		routeFee: string | null;
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
				"data-route-fee": routeFee,
				"data-show-spot-funds-notice": showSpotFundsNotice,
				"data-testid": "withdraw-routing-status",
				"data-status": routingStatus,
				"data-preflight-failed": routingPreflightFailed,
			},
			createElement("button", { onClick: () => onAmountChange(testState.withdrawDraft), type: "button" }, "Set amount"),
			destinationRequired
				? createElement("input", {
						"aria-label": "Destination address",
						value: destination,
						onChange: (event: { target: { value: string } }) => onDestinationChange(event.target.value),
					})
				: null,
			createElement("p", { "data-testid": "withdrawal-destination-error" }, destinationError),
			createElement("p", { "data-testid": "withdrawal-prerequisite" }, prerequisiteError),
			createElement("p", { "data-testid": "withdrawal-validation" }, validation.error),
			createElement("button", { disabled: !canSubmit, onClick: onSubmit, type: "button" }, "Submit withdrawal"),
			createElement("button", { onClick: onRetryPrerequisites, type: "button" }, "Retry withdrawal route"),
		);
	},
}));

describe("DepositModal withdrawal route pre-execution guard wiring", () => {
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;

	beforeEach(async () => {
		vi.clearAllMocks();
		testState.formatLocale = "en-US";
		testState.depositExecutionAmount = null;
		testState.accountAbstraction = "disabled";
		i18n.loadAndActivate({ locale: "en", messages: {} });
		testState.exchangeGuards.clear();
		testState.exchangeErrors.clear();
		testState.exchangePending.clear();
		toastMocks.error.mockReset();
		toastMocks.success.mockReset();
		toastMocks.warning.mockReset();
		closeDepositModal.mockReset();
		resetDeposit.mockReset();
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
		testState.cctpRecoveryRecord = null;
		testState.fiatFlags = { mainnet: false, testnet: false };
		testState.fiatOffer = null;
		testState.fiatOfferOptions = null;
		testState.isTestnet = false;
		testState.networkSwitchPending = false;
		testState.modalOpen = false;
		testState.modalOnOpenChange = null;
		testState.modalHeader = null;
		testState.deposit.mockReset();
		testState.refreshDepositBalance.mockReset().mockResolvedValue(10_000_000n);
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
		testState.cctpDepositBelowMinimumRaw = null;
		testState.cctpDepositRefetchForwardFeeRaw = 200_000n;
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
		testState.walletProviderError = null;
		testState.walletProviderStatus = "idle";
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
					createElement(I18nProvider, { i18n }, createElement(DepositModalHost)),
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

	async function rerender(sessionKey?: string) {
		await act(async () => {
			testState.renderVersion += 1;
			for (const listener of testState.renderListeners) listener();
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(
						I18nProvider,
						{ i18n },
						createElement(DepositModalHost, sessionKey ? { key: sessionKey } : null),
					),
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

	async function expectWithdrawalErrorNotified(messageKey: keyof typeof WITHDRAWAL_MESSAGES, staleMessage?: string) {
		await vi.waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(WITHDRAWAL_MESSAGES[messageKey]));
		expect(toastMocks.error).toHaveBeenCalledOnce();
		if (staleMessage) expect(toastMocks.error).not.toHaveBeenCalledWith(expect.stringContaining(staleMessage));
		expect(container.querySelector('[data-testid="status-screen"]')).toBeNull();
		expect(closeDepositModal).toHaveBeenCalledOnce();
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

	it("writes the amount of a pending deposit in plain notation with the number-format separators", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.depositStatus = "pending";
		testState.depositExecutionAmount = "0001234.5";
		testState.formatLocale = "de-DE";
		await rerender();
		expect(container.querySelector('[data-testid="status-description"]')?.textContent).toContain(
			"1.234,5 USDC → Hyperliquid",
		);
	});

	it.each([
		[
			"the email wallet itself",
			"0x1111111111111111111111111111111111111111",
			"Withdrawing to yourself is not allowed because it would automatically trigger a deposit. Enter a different address.",
		],
		[
			"the Arbitrum USDC contract",
			"0xaf88d065e77c8cc2239327c5edb3a432268e5831",
			"Cannot withdraw to the USDC contract address.",
		],
		[
			"the Arbitrum Sepolia USDC contract",
			"0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
			"Cannot withdraw to the USDC contract address.",
		],
	])("refuses an email withdrawal to %s", async (_case, destination, message) => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.emailAddress = "trader@example.com";
		await rerender();
		act(() => getButton("Set amount").click());
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Destination address"]');
		if (!input) throw new Error("Expected the destination input");
		act(() => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, destination);
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});

		expect(container.querySelector('[data-testid="withdrawal-destination-error"]')?.textContent).toBe(message);
		expect(getButton("Submit withdrawal").disabled).toBe(true);
		await act(async () => getButton("Submit withdrawal").click());
		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		expect(testState.exchangeSdkCalls.get("withdraw3")).not.toHaveBeenCalled();
	});

	it("writes the CCTP minimum withdrawal with the number-format separators", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.cctpWithdrawalFee = "600.25";
		await rerender();
		act(() => getButton("Set amount").click());
		const validation = () => container.querySelector('[data-testid="withdrawal-validation"]')?.textContent;
		expect(validation()).toBe("Minimum withdrawal is $1,200.5");

		testState.formatLocale = "de-DE";
		await act(async () => notifyNumberFormatChange());
		expect(validation()).toBe("Minimum withdrawal is $1.200,5");
	});

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

		it("reports a final guard rejection through a notification and closes the dialog", async () => {
			const { release, submission } = await pauseAfterPreflight();
			testState.withdrawable = "1";
			await rerender();
			await act(async () => {
				release();
				await submission;
			});
			expect(toastMocks.error).toHaveBeenCalledExactlyOnceWith(WITHDRAWAL_MESSAGES.balanceChanged);
			expect(toastMocks.warning).not.toHaveBeenCalled();
			expect(toastMocks.success).not.toHaveBeenCalled();
			expect(container.querySelector('[data-testid="status-screen"]')).toBeNull();
			expect(closeDepositModal).toHaveBeenCalledOnce();
			expect(testState.exchangeSdkCalls.get(method)).not.toHaveBeenCalled();
			expect(testState.exchangeMutations.get(method)).toHaveBeenCalledOnce();
		});

		it("reports a submitted withdrawal with the amount to receive and closes the dialog", async () => {
			const { release, submission } = await pauseAfterPreflight();
			await rerender();
			await act(async () => {
				release();
				await submission;
			});
			expect(testState.exchangeSdkCalls.get(method)).toHaveBeenCalledOnce();
			expect(toastMocks.success).toHaveBeenCalledExactlyOnceWith(
				"Withdrawal submitted",
				expect.objectContaining({ description: expect.anything() }),
			);
			expect(getToastText(toastMocks.success.mock.calls[0])).toBe(
				"Withdrawal submitted You'll receive $1.00 on Arbitrum after confirmation.",
			);
			expect(toastMocks.error).not.toHaveBeenCalled();
			expect(container.querySelector('[data-testid="status-screen"]')).toBeNull();
			expect(closeDepositModal).toHaveBeenCalledOnce();
		});

		it("keeps the amount to receive isolated inside the translated sentence", async () => {
			const sentence = `You'll receive <0>\${netReceived}</0> on Arbitrum after confirmation.`;
			act(() =>
				i18n.loadAndActivate({
					locale: "ar",
					messages: { [getMessageId(sentence)]: `ستتلقى <0>\${netReceived}</0> على Arbitrum بعد التأكيد.` },
				}),
			);
			const { release, submission } = await pauseAfterPreflight();
			await rerender();
			await act(async () => {
				release();
				await submission;
			});
			const options = toastMocks.success.mock.calls[0]?.[1] as { description?: ReactNode } | undefined;
			const host = document.createElement("div");
			const descriptionRoot = createRoot(host);
			act(() => descriptionRoot.render(createElement(I18nProvider, { i18n }, options?.description)));
			const amount = host.querySelector("bdi");
			expect(host.textContent).toBe("ستتلقى $1.00 على Arbitrum بعد التأكيد.");
			expect(amount?.getAttribute("dir")).toBe("ltr");
			expect(amount?.textContent).toBe("$1.00");
			act(() => descriptionRoot.unmount());
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
				const activationLine = route === "cctp" ? "One-time account activation fee: $1.00" : "";
				expect(getToastText(toastMocks.success.mock.calls[0])).toBe(
					`Withdrawal submitted You'll receive $1.00 on Arbitrum after confirmation.${activationLine}`,
				);
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
			expect(toastMocks.error).not.toHaveBeenCalled();
			expect(closeDepositModal).not.toHaveBeenCalled();
			await act(async () => {
				releaseSecond();
				await secondSubmission;
			});
			expect(testState.exchangeSdkCalls.get(method)).toHaveBeenCalledOnce();
			expect(toastMocks.success).toHaveBeenCalledOnce();
			expect(toastMocks.error).not.toHaveBeenCalled();
			expect(closeDepositModal).toHaveBeenCalledOnce();
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
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		let resolveRouting!: (value: { depositRoute: "cctp"; withdrawalRoute: "cctp" }) => void;
		testState.fetchFreshRouting.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveRouting = resolve;
			}),
		);

		await rerender();
		act(() => getButton("Set deposit amount").click());
		act(() => getButton("Submit deposit").click());
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

	it.each([
		{ direction: "higher", displayedFee: "1", clickTimeFee: "2", received: "$8.00" },
		{ direction: "lower", displayedFee: "2", clickTimeFee: "1", received: "$9.00" },
	])(
		"submits with a $direction CCTP fee read at the click and reports the amount it leaves",
		async ({ displayedFee, clickTimeFee, received }) => {
			testState.modalOpen = true;
			testState.activeTab = "withdraw";
			testState.withdrawable = "100";
			testState.withdrawDraft = "10";
			testState.cctpWithdrawalFee = displayedFee;
			testState.cctpWithdrawalFeeRefetch.mockImplementation(async () => {
				testState.cctpWithdrawalFee = clickTimeFee;
				return { data: clickTimeFee, isError: false };
			});
			await rerender();
			act(() => getButton("Set amount").click());
			expect(container.querySelector('[data-testid="withdraw-routing-status"]')?.getAttribute("data-route-fee")).toBe(
				displayedFee,
			);

			await act(async () => getButton("Submit withdrawal").click());

			expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({ amount: "10" }),
			);
			expect(testState.cctpWithdrawalFeeRefetch).toHaveBeenCalledOnce();
			expect(getToastText(toastMocks.success.mock.calls[0])).toBe(
				`Withdrawal submitted You'll receive ${received} on Arbitrum after confirmation.`,
			);
			expect(toastMocks.error).not.toHaveBeenCalled();
			expect(closeDepositModal).toHaveBeenCalledOnce();
		},
	);

	it("stays in the form when the fee read at the click raises the minimum above the amount", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.withdrawable = "100";
		testState.withdrawDraft = "10";
		testState.cctpWithdrawalFeeRefetch.mockImplementation(async () => {
			testState.cctpWithdrawalFee = "6";
			return { data: "6", isError: false };
		});

		await submitWithdrawal();

		const form = container.querySelector('[data-testid="withdraw-routing-status"]');
		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		expect(testState.exchangeMutations.get("sendToEvmWithData")).not.toHaveBeenCalled();
		expect(container.querySelector('[data-testid="withdrawal-prerequisite"]')?.textContent).toBe(
			"Withdrawal conditions changed before signing. Review the withdrawal and submit it again.",
		);
		expect(form?.getAttribute("data-amount")).toBe("10");
		expect(form?.getAttribute("data-route-fee")).toBe("6");
		expect(getButton("Submit withdrawal").disabled).toBe(true);
		expect(toastMocks.success).not.toHaveBeenCalled();
		expect(toastMocks.error).not.toHaveBeenCalled();
		expect(closeDepositModal).not.toHaveBeenCalled();
	});

	it("reports the amount from the fee read at the click when the cached fee changes before submission", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.withdrawable = "100";
		testState.withdrawDraft = "10";
		testState.cctpWithdrawalFeeRefetch.mockImplementation(async () => {
			testState.cctpWithdrawalFee = "2";
			return { data: "2", isError: false };
		});
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

		testState.cctpWithdrawalFee = "3";
		await rerender();
		expect(container.querySelector('[data-testid="withdraw-routing-status"]')?.getAttribute("data-route-fee")).toBe(
			"3",
		);
		await act(async () => {
			release();
			await submission;
		});

		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ amount: "10" }),
		);
		expect(testState.cctpWithdrawalFeeRefetch).toHaveBeenCalledOnce();
		expect(getToastText(toastMocks.success.mock.calls[0])).toBe(
			"Withdrawal submitted You'll receive $8.00 on Arbitrum after confirmation.",
		);
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

	it("reports a withdrawal-route availability guard from its stable code", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.fetchFreshRouting
			.mockReset()
			.mockResolvedValueOnce({ depositRoute: "bridge", withdrawalRoute: "cctp" })
			.mockRejectedValueOnce(new Error("raw route HTTP failure"));

		await submitWithdrawal();

		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		await expectWithdrawalErrorNotified("routeUnavailable", "raw route HTTP failure");
	});

	it("reports a withdrawal-route change guard from its stable code", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.fetchFreshRouting
			.mockReset()
			.mockResolvedValueOnce({ depositRoute: "bridge", withdrawalRoute: "cctp" })
			.mockResolvedValueOnce({ depositRoute: "bridge", withdrawalRoute: "bridge" });

		await submitWithdrawal();

		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		await expectWithdrawalErrorNotified("routeChanged");
	});

	it("reports a account-mode guard from its stable code", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.accountGuard.mockRejectedValueOnce(new AccountAbstractionExecutionError("changed"));

		await submitWithdrawal();

		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		await expectWithdrawalErrorNotified("accountModeChanged");
	});

	it("reports a geo guard from its stable code", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.assertFreshGeoAllowed.mockRejectedValueOnce(new FundsActionGeoExecutionError("unavailable"));

		await submitWithdrawal();

		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		await expectWithdrawalErrorNotified("geoUnavailable");
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
	] as const)("reports a pre-transfer $name guard from its stable code", async ({ messageKey, prepare }) => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		prepare();

		await submitWithdrawal();

		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		await expectWithdrawalErrorNotified(messageKey);
	});

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
	] as const)("reports a $name balance guard from its stable code", async ({ messageKey, update }) => {
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
		await expectWithdrawalErrorNotified(messageKey);
	});

	it("reports a raw exchange error unchanged in any locale", async () => {
		const rawExchangeMessage = "Hyperliquid SDK rejected withdrawal TEST-RAW";
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.exchangeSdkCalls
			.get("sendToEvmWithData")
			?.mockRejectedValueOnce(new ApiRequestError({ status: "err", response: rawExchangeMessage }, rawExchangeMessage));

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		await submitWithdrawal();

		await vi.waitFor(() => expect(toastMocks.error).toHaveBeenCalledExactlyOnceWith(rawExchangeMessage));
		expect(closeDepositModal).toHaveBeenCalledOnce();
	});

	it("formats a guard rejection from its stable code in the locale that is active when it fails", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.preTransferFresh = { ...testState.preTransferFresh, fee: "0.5" };
		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		await submitWithdrawal();

		await vi.waitFor(() =>
			expect(toastMocks.error).toHaveBeenCalledExactlyOnceWith(WITHDRAWAL_MESSAGES_AR.preTransferChanged),
		);
	});

	it("keeps an unconfirmed withdrawal on screen as a warning until it is dismissed", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.exchangeSdkCalls
			.get("sendToEvmWithData")
			?.mockRejectedValueOnce(new HttpRequestError({ detail: "Request timed out" }));

		await submitWithdrawal();

		await vi.waitFor(() =>
			expect(toastMocks.warning).toHaveBeenCalledExactlyOnceWith("Withdrawal status unknown", {
				closeButton: true,
				description: "Check your balances and the Deposits & Withdrawals history before retrying.",
				duration: Number.POSITIVE_INFINITY,
				icon: unknownStatusToastIcon(),
			}),
		);
		expect(toastMocks.error).not.toHaveBeenCalled();
		expect(closeDepositModal).toHaveBeenCalledOnce();
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

	it("retries deposit data without signing and clears feedback only after success", async () => {
		testState.modalOpen = true;
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.refreshDepositBalance.mockRejectedValueOnce(new Error("private balance transport detail"));
		await rerender();
		await act(async () => getButton("Retry deposit data").click());
		expect(container.querySelector('[data-testid="deposit-data-error"]')?.textContent).toBe(
			WITHDRAWAL_MESSAGES.balanceUnavailable,
		);
		expect(container.textContent).not.toContain("private balance transport detail");
		await act(async () => getButton("Retry deposit data").click());
		expect(container.querySelector('[data-testid="deposit-data-error"]')?.textContent).toBe("");
		expect(testState.refreshDepositBalance).toHaveBeenCalledTimes(2);
		expect(testState.deposit).not.toHaveBeenCalled();
	});

	it("discards an old deposit-data retry after closing and reopening", async () => {
		testState.modalOpen = true;
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		let fail!: (error: Error) => void;
		testState.refreshDepositBalance.mockReturnValueOnce(
			new Promise((_, reject) => {
				fail = reject;
			}),
		);
		await rerender();
		await act(async () => getButton("Retry deposit data").click());
		expect(container.querySelector('[data-testid="deposit-routing-status"]')?.getAttribute("data-is-pending")).toBe(
			"false",
		);
		expect(container.querySelector('[data-testid="deposit-routing-status"]')?.getAttribute("data-balance-status")).toBe(
			"loading",
		);
		testState.modalOpen = false;
		await rerender();
		testState.modalOpen = true;
		await rerender();
		await act(async () => fail(new Error("old retry")));
		expect(container.querySelector('[data-testid="deposit-data-error"]')?.textContent).toBe("");
		expect(testState.deposit).not.toHaveBeenCalled();
	});

	it("keeps a confirmed capacity failure visible after a data retry", async () => {
		testState.modalOpen = true;
		testState.emailAddress = "owner@example.com";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.refreshDepositBalance.mockResolvedValue(150_000_000n);
		await rerender();
		await act(async () => getButton("Retry deposit data").click());
		expect(container.querySelector('[data-testid="deposit-data-error"]')?.textContent).toContain(
			"Circle Fast Transfer capacity",
		);
		expect(testState.deposit).not.toHaveBeenCalled();
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

	it("gives the amount field the minimum failure and the form both minimum values", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.cctpDepositFeeCalculation = null;
		testState.cctpDepositBelowMinimumRaw = 400_000n;

		await rerender();

		const depositForm = container.querySelector('[data-testid="deposit-routing-status"]');
		expect(depositForm?.getAttribute("data-amount-error")).toBe("Minimum deposit is 0.4 USDC");
		expect(depositForm?.getAttribute("data-minimum")).toBe("400000");
		expect(depositForm?.getAttribute("data-below-minimum")).toBe("400000");
		expect(depositForm?.getAttribute("data-valid")).toBe("false");

		testState.formatLocale = "de-DE";
		await rerender();
		expect(container.querySelector('[data-testid="deposit-routing-status"]')?.getAttribute("data-amount-error")).toBe(
			"Minimum deposit is 0,4 USDC",
		);
	});

	it("leaves the amount field without a minimum failure once the amount meets it", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };

		await rerender();

		const depositForm = container.querySelector('[data-testid="deposit-routing-status"]');
		expect(depositForm?.hasAttribute("data-amount-error")).toBe(false);
		expect(depositForm?.getAttribute("data-minimum")).toBe("400000");
		expect(depositForm?.hasAttribute("data-below-minimum")).toBe(false);
	});

	it("reports a fee rise that pushes the reviewed amount below the minimum as a fee change, not a route failure", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.freshRoutingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.depositMaxRaw = 400_000n;
		testState.cctpDepositFeeCalculation = { maxFeeRaw: 200_000n, netAmountRaw: 200_000n };
		testState.cctpDepositRefetchForwardFeeRaw = 210_000n;

		await rerender();
		act(() => getButton("Set deposit amount").click());
		await act(async () => getButton("Submit deposit").click());

		expect(testState.deposit).not.toHaveBeenCalled();
		expect(container.querySelector('[data-testid="deposit-data-error"]')?.textContent).toBe(
			"Circle fees changed. Review the updated fee, then submit again.",
		);
		expect(container.querySelector('[data-testid="deposit-routing-preflight-error"]')).toBeNull();
		expect(container.querySelector('[data-testid="deposit-routing-status"]')?.getAttribute("data-status")).toBe(
			"ready",
		);
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
		expect(withdrawTitle?.className).toContain("sr-only");
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

		expect(
			[...container.querySelectorAll("button")].some((button) =>
				/^(Deposit|Submit deposit)/.test(button.textContent ?? ""),
			),
		).toBe(false);
		expect(testState.deposit).not.toHaveBeenCalled();
	});

	it("shows the mainnet funding address without a manual deposit action owned by the modal", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.emailAddress = "trader@example.com";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		await rerender();
		const form = container.querySelector('[data-testid="deposit-routing-status"]');
		expect(form?.getAttribute("data-funding-address")).toBe(testState.walletAddress);
		expect(form?.getAttribute("data-readiness-status")).toBe("ready");
		expect(
			[...container.querySelectorAll("button")].some((button) =>
				/^(Deposit|Submit deposit)/.test(button.textContent ?? ""),
			),
		).toBe(false);
		expect(testState.deposit).not.toHaveBeenCalled();
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

	function getToastText(call: unknown[] | undefined): string {
		const options = call?.[1] as { description?: ReactNode } | undefined;
		const host = document.createElement("div");
		const descriptionRoot = createRoot(host);
		act(() => descriptionRoot.render(createElement(I18nProvider, { i18n }, options?.description)));
		const text = `${String(call?.[0])} ${host.textContent ?? ""}`;
		act(() => descriptionRoot.unmount());
		return text;
	}

	it("reports a localized definitive source failure without parsing its wording and closes", async () => {
		testState.modalOpen = true;
		testState.depositStatus = "error";
		testState.depositHash = `0x${"1".repeat(64)}`;
		testState.depositExecutionRoute = "cctp";
		testState.depositError = new DefinitiveDepositSourceFailureError(
			"source-transaction-reverted",
			"交易已在 Arbitrum 上回滚",
		);

		await rerender();
		await rerender();

		expect(toastMocks.error).toHaveBeenCalledOnce();
		expect(getToastText(toastMocks.error.mock.calls[0])).toContain("Deposit failed Transaction reverted on Arbitrum");
		expect(getToastText(toastMocks.error.mock.calls[0])).toContain("View on explorer");
		expect(toastMocks.warning).not.toHaveBeenCalled();
		expect(container.querySelector('[data-testid="status-screen"]')).toBeNull();
		expect(closeDepositModal).toHaveBeenCalledOnce();
	});

	it("reports a deposit-route error from its stable code and returns to the form for a retry", async () => {
		testState.modalOpen = true;
		testState.depositStatus = "error";
		testState.depositError = new UsdcDepositRouteError("changed");
		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		await rerender();

		expect(toastMocks.error).toHaveBeenCalledExactlyOnceWith(WITHDRAWAL_MESSAGES_AR.depositRouteChanged);
		expect(resetDeposit).toHaveBeenCalledOnce();
		expect(closeDepositModal).not.toHaveBeenCalled();
	});

	it("reports a deposit failure raised by the deposit flow in the active language", async () => {
		const feeChanged = "Circle fees changed before submission. Review the updated fee and retry.";
		const feeChangedAr = "تغيرت رسوم Circle قبل الإرسال. راجع الرسوم المحدّثة وأعد المحاولة.";
		testState.modalOpen = true;
		testState.depositStatus = "error";
		testState.depositError = new LocalizedActionError({ id: getMessageId(feeChanged), message: feeChanged });
		act(() => i18n.loadAndActivate({ locale: "ar", messages: { [getMessageId(feeChanged)]: feeChangedAr } }));

		await rerender();

		expect(toastMocks.error).toHaveBeenCalledExactlyOnceWith(feeChangedAr);
	});

	it("reports an unrecognised deposit failure with the deposit message instead of its raw text", async () => {
		testState.modalOpen = true;
		testState.depositStatus = "error";
		testState.depositError = new Error("Paymaster policy rejected sponsored call");

		await rerender();

		expect(toastMocks.error).toHaveBeenCalledExactlyOnceWith("Deposit failed");
		expect(resetDeposit).toHaveBeenCalledOnce();
	});

	it("explains an unavailable wallet provider without its raw provider text", async () => {
		testState.modalOpen = true;
		testState.walletProviderStatus = "error";
		testState.walletProviderError = new Error("Internal JSON-RPC error.");

		await rerender();

		expect(container.querySelector('[data-testid="status-description"]')?.textContent).toBe(
			"Wallet connection failed. Unlock your wallet, approve the connection, then retry.",
		);
	});

	it("does not infer a definitive outcome from an unstructured error message", async () => {
		testState.modalOpen = true;
		testState.depositStatus = "error";
		testState.depositHash = `0x${"2".repeat(64)}`;
		testState.depositExecutionRoute = "cctp";
		testState.depositError = new Error("Transaction reverted on Arbitrum");

		await rerender();

		expect(toastMocks.error).not.toHaveBeenCalled();
		expect(toastMocks.warning).toHaveBeenCalledExactlyOnceWith(
			"Deposit status unknown",
			expect.objectContaining({
				closeButton: true,
				duration: Number.POSITIVE_INFINITY,
				icon: unknownStatusToastIcon(),
			}),
		);
		expect(getToastText(toastMocks.warning.mock.calls[0])).toContain("its final status could not be verified");
		expect(closeDepositModal).toHaveBeenCalledOnce();
	});

	it("does not offer a retry when a sponsored submission may have reached the bundler without returning a hash", async () => {
		testState.modalOpen = true;
		testState.depositStatus = "error";
		testState.depositHash = undefined;
		testState.depositExecutionRoute = "cctp";
		testState.depositError = new Error("Bundler response was interrupted");
		testState.submissionOutcomeUnknown = true;

		await rerender();

		expect(toastMocks.warning).toHaveBeenCalledExactlyOnceWith("Deposit status unknown", expect.anything());
		const description = getToastText(toastMocks.warning.mock.calls[0]);
		expect(description).toContain("The wallet did not return a transaction hash");
		expect(description).toContain("A signed authorization may still be active");
		expect(description).not.toContain("The Arbitrum transaction was submitted");
		expect(resetDeposit).toHaveBeenCalledOnce();
		expect(closeDepositModal).toHaveBeenCalledOnce();
		expect(toastMocks.error).not.toHaveBeenCalled();
	});

	it("hands a confirmed CCTP deposit to the page-level tracker without a notification of its own", async () => {
		testState.modalOpen = true;
		testState.depositStatus = "success";
		testState.depositHash = `0x${"4".repeat(64)}`;
		testState.depositExecutionRoute = "cctp";

		await rerender();

		expect(toastMocks.success).not.toHaveBeenCalled();
		expect(toastMocks.warning).not.toHaveBeenCalled();
		expect(closeDepositModal).toHaveBeenCalledOnce();
	});

	describe("deposit method choice", () => {
		function offerCardFunding(walletKind: "embedded" | "external" = "embedded") {
			testState.fiatOffer = { walletKind, disabled: false, start: vi.fn() };
		}

		function methods() {
			return container.querySelector('[data-deposit-layout="methods"]');
		}

		function depositForm() {
			return container.querySelector('[data-testid="deposit-routing-status"]');
		}

		function backButton() {
			return container.querySelector<HTMLButtonElement>('button[aria-label="Back"]');
		}

		function chooseMethod(method: "fiat" | "transfer") {
			const option = container.querySelector<HTMLButtonElement>(`[data-deposit-method="${method}"]`);
			if (!option) throw new Error(`Missing ${method} option`);
			act(() => option.click());
		}

		it("goes straight to the deposit form when no card funding is offered", async () => {
			testState.modalOpen = true;
			await rerender();

			expect(methods()).toBeNull();
			expect(depositForm()).not.toBeNull();
			expect(backButton()).toBeNull();
		});

		it("opens on the method choice, leads to the deposit form and back", async () => {
			offerCardFunding();
			testState.modalOpen = true;
			await rerender();
			expect(methods()).not.toBeNull();
			expect(depositForm()).toBeNull();

			chooseMethod("transfer");
			expect(methods()).toBeNull();
			expect(depositForm()).not.toBeNull();

			const back = backButton();
			expect(back).not.toBeNull();
			act(() => back?.click());
			expect(methods()).not.toBeNull();
			expect(depositForm()).toBeNull();
		});

		it("ships the back button the browser fixture renders, directly inside the header", async () => {
			offerCardFunding();
			testState.modalOpen = true;
			await rerender();
			chooseMethod("transfer");

			const reference = document.createElement("div");
			const referenceRoot = createRoot(reference);
			await act(async () => {
				referenceRoot.render(renderFundsModalBackButton({ disabled: false, label: "Back", onClick: () => undefined }));
			});
			const shared = reference.firstElementChild;
			const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Back"]');
			const header = testState.modalHeader;
			if (!header || !shared) throw new Error("The dialog header or the reference button was not rendered");

			expect(reference.children).toHaveLength(1);
			expect(shared.tagName).toBe("BUTTON");
			expect(shared.className.split(" ")).toContain("z-10");
			expect(buttons).toHaveLength(1);
			expect(buttons[0].outerHTML).toBe(shared.outerHTML);
			expect(buttons[0].parentElement).toBe(header);
			expect(header.childNodes).toHaveLength(2);
			expect(header.childNodes[0]).toBe(buttons[0]);
			expect(header.childNodes[1]).toBe(header.querySelector("h2"));
			await act(async () => referenceRoot.unmount());
		});

		it("starts the card purchase from its own entry", async () => {
			offerCardFunding();
			testState.modalOpen = true;
			await rerender();

			chooseMethod("fiat");

			expect(testState.fiatOffer?.start).toHaveBeenCalledOnce();
			expect(testState.deposit).not.toHaveBeenCalled();
		});

		it("returns to the method choice every time the dialog opens", async () => {
			offerCardFunding();
			testState.modalOpen = true;
			await rerender();
			chooseMethod("transfer");
			expect(depositForm()).not.toBeNull();

			testState.modalOpen = false;
			await rerender();
			expect(depositForm()).not.toBeNull();
			testState.modalOpen = true;
			await rerender();

			expect(methods()).not.toBeNull();
		});

		it("opens the transfer form for an external wallet without a network gate", async () => {
			offerCardFunding("external");
			testState.walletProviderStatus = "ready";
			testState.modalOpen = true;
			await rerender();
			expect(methods()).not.toBeNull();

			chooseMethod("transfer");

			expect(depositForm()).not.toBeNull();
		});

		it("closes the deposit dialog before the card purchase starts", async () => {
			offerCardFunding();
			testState.modalOpen = true;
			await rerender();

			act(() => testState.fiatOfferOptions?.onBeforeStart());

			expect(closeDepositModal).toHaveBeenCalledOnce();
		});

		it("keeps the way back disabled while a deposit is being prepared", async () => {
			offerCardFunding("external");
			testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
			testState.modalOpen = true;
			await rerender();
			chooseMethod("transfer");
			expect(backButton()?.disabled).toBe(false);

			let releaseRouting: () => void = () => undefined;
			testState.fetchFreshRouting.mockImplementation(
				() =>
					new Promise((resolve) => {
						releaseRouting = () => resolve({ depositRoute: "bridge", withdrawalRoute: "cctp" });
					}),
			);
			await act(async () => getButton("Submit deposit").click());
			expect(backButton()?.disabled).toBe(true);

			await act(async () => releaseRouting());
			expect(backButton()?.disabled).toBe(false);
			expect(testState.deposit).not.toHaveBeenCalled();
		});

		it("decides the first screen once per opening instead of flipping while the session settles", async () => {
			testState.modalOpen = true;
			await rerender();
			expect(depositForm()).not.toBeNull();

			offerCardFunding();
			await rerender();
			expect(depositForm()).not.toBeNull();
			expect(methods()).toBeNull();

			testState.modalOpen = false;
			await rerender();
			testState.modalOpen = true;
			await rerender();
			expect(methods()).not.toBeNull();

			testState.fiatOffer = null;
			await rerender();
			expect(methods()).not.toBeNull();
			const fiat = container.querySelector<HTMLButtonElement>('[data-deposit-method="fiat"]');
			expect(fiat?.disabled).toBe(true);
		});

		it("names the network switch while the wallet is asked to move to Arbitrum", async () => {
			testState.modalOpen = true;
			testState.activeTab = "deposit";
			testState.depositStatus = "pending";
			testState.networkSwitchPending = true;
			await rerender();

			expect(container.querySelector('[data-testid="status-heading"]')?.textContent).toBe("Switching network");

			testState.networkSwitchPending = false;
			await rerender();

			expect(container.querySelector('[data-testid="status-heading"]')?.textContent).toBe("Confirm in wallet");
		});

		it("warms the purchase host while the purchase entry is on screen", async () => {
			offerCardFunding();
			await rerender();
			expect(warmPrivyFiatFundingHost).not.toHaveBeenCalled();

			testState.modalOpen = true;
			await rerender();
			expect(methods()).not.toBeNull();
			expect(warmPrivyFiatFundingHost).toHaveBeenCalledOnce();

			chooseMethod("transfer");
			expect(warmPrivyFiatFundingHost).toHaveBeenCalledOnce();
		});

		it("does not warm the purchase host while another screen replaces the purchase entry", async () => {
			offerCardFunding();
			testState.cctpRecoveryRecord = { sourceHash: `0x${"ab".repeat(32)}` };
			testState.modalOpen = true;
			await rerender();
			expect(methods()).toBeNull();
			expect(container.textContent).toContain("Forwarding deposit");
			expect(warmPrivyFiatFundingHost).not.toHaveBeenCalled();

			testState.cctpRecoveryRecord = null;
			await rerender();
			expect(methods()).not.toBeNull();
			expect(warmPrivyFiatFundingHost).toHaveBeenCalledOnce();
		});

		it("does not warm the purchase host when the wallet that would deposit is not connected", async () => {
			offerCardFunding("external");
			testState.walletIntentOverride = "ambiguous";
			testState.modalOpen = true;
			await rerender();

			expect(methods()).toBeNull();
			expect(warmPrivyFiatFundingHost).not.toHaveBeenCalled();
		});

		it("does not warm the purchase host when no purchase can start", async () => {
			testState.modalOpen = true;
			await rerender();
			expect(depositForm()).not.toBeNull();
			expect(warmPrivyFiatFundingHost).not.toHaveBeenCalled();

			testState.modalOpen = false;
			await rerender();
			testState.fiatOffer = { walletKind: "embedded", disabled: true, start: vi.fn() };
			testState.modalOpen = true;
			await rerender();
			expect(methods()).not.toBeNull();
			expect(warmPrivyFiatFundingHost).not.toHaveBeenCalled();
		});

		it("decides the first screen again when the dialog is rebuilt for another wallet identity", async () => {
			testState.modalOpen = true;
			await rerender("mainnet:none");
			expect(depositForm()).not.toBeNull();
			expect(methods()).toBeNull();

			offerCardFunding();
			await rerender("mainnet:owner");
			expect(methods()).not.toBeNull();
			expect(depositForm()).toBeNull();

			testState.fiatOffer = null;
			await rerender("mainnet:agent-only");
			expect(methods()).toBeNull();
			expect(depositForm()).not.toBeNull();
		});

		it.each([
			[{ mainnet: true, testnet: false }, false, true],
			[{ mainnet: true, testnet: false }, true, false],
			[{ mainnet: false, testnet: true }, false, false],
			[{ mainnet: false, testnet: true }, true, true],
		])(
			"offers the purchase only under the flag of the current network: %j on testnet=%j",
			async (flags, isTestnet, enabled) => {
				testState.fiatFlags = flags;
				testState.isTestnet = isTestnet;
				testState.modalOpen = true;
				await rerender();

				expect(testState.fiatOfferOptions?.enabled).toBe(enabled);
			},
		);

		it("lets the offer know when deposits are unavailable or busy", async () => {
			offerCardFunding();
			testState.modalOpen = true;
			await rerender();
			expect(testState.fiatOfferOptions?.available).toBe(true);

			testState.depositStatus = "pending";
			await rerender();
			expect(testState.fiatOfferOptions?.available).toBe(false);

			testState.depositStatus = "idle";
			testState.depositAvailable = false;
			await rerender();
			expect(testState.fiatOfferOptions?.available).toBe(false);
		});

		it("turns the purchase entry off while a withdrawal is pending and once the dialog is closing", async () => {
			offerCardFunding();
			testState.modalOpen = true;
			await rerender();
			expect(testState.fiatOfferOptions?.available).toBe(true);

			testState.exchangePending.add("sendToEvmWithData");
			await rerender();
			expect(testState.fiatOfferOptions?.available).toBe(false);

			testState.exchangePending.clear();
			await rerender();
			expect(testState.fiatOfferOptions?.available).toBe(true);

			testState.modalOpen = false;
			await rerender();
			expect(methods()).not.toBeNull();
			expect(testState.fiatOfferOptions?.available).toBe(false);
		});
	});
});
