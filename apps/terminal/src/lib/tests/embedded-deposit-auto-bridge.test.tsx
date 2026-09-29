// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, Fragment, isValidElement, type ReactNode, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddedDepositAutoBridge } from "@/components/trade/tradebox/embedded-deposit-auto-bridge";
import { UsdcDepositRouteError } from "@/hooks/trade/use-usdc-routing";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";

const USER_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const NOTIFICATION_ID = expect.stringMatching(new RegExp(`^embedded-cctp-auto-deposit:Testnet:${USER_ADDRESS}:\\d+$`));
const HASH = "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
const DEPOSIT_ROUTE_CHANGED =
	"The Hyperliquid deposit route changed before signing. Review the updated route and retry.";
const DEPOSIT_ROUTE_CHANGED_AR = "تغير مسار إيداع Hyperliquid قبل التوقيع. راجع المسار المحدّث وأعد المحاولة.";
const FAST_TRANSFER_UNAVAILABLE = "Circle Fast Transfer capacity is temporarily unavailable. Try again later.";
const FAST_TRANSFER_UNAVAILABLE_AR = "سعة Circle Fast Transfer غير متاحة مؤقتًا. حاول مرة أخرى لاحقًا.";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(DEPOSIT_ROUTE_CHANGED)]: DEPOSIT_ROUTE_CHANGED_AR,
	[getMessageId(FAST_TRANSFER_UNAVAILABLE)]: FAST_TRANSFER_UNAVAILABLE_AR,
};

const testState = vi.hoisted(() => ({
	owner: "0x1111111111111111111111111111111111111111",
	deposit: vi.fn(),
	depositError: null as Error | null,
	depositHash: undefined as `0x${string}` | undefined,
	depositModalOpen: false,
	depositStatus: "idle" as "idle" | "pending" | "confirming" | "success" | "error",
	isTestnet: true,
	maxDepositRaw: 9_000_000n as bigint | undefined,
	refreshBalance: vi.fn(),
	resetDeposit: vi.fn(),
	routingData: { depositRoute: "cctp", withdrawalRoute: "cctp" } as {
		depositRoute: "bridge" | "cctp";
		withdrawalRoute: "bridge" | "cctp";
	} | null,
	routingIsError: false,
	routingIsFetching: false,
	routingQueryEnabled: undefined as boolean | undefined,
	sponsoredEnabled: true,
	toastDismiss: vi.fn(),
	toastError: vi.fn(),
	toastLoading: vi.fn(),
	toastSuccess: vi.fn(),
	useDepositOptions: null as null | Record<string, unknown>,
	trackingOptions: null as null | Record<string, unknown>,
	trackingRecoveryRecord: null as null | { sourceHash: `0x${string}` },
	walletIntent: "embedded" as "ambiguous" | "embedded" | "external" | "unavailable",
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function withI18n(children: ReactNode): ReactNode {
	if (isValidElement<{ children?: ReactNode }>(children) && children.type === StrictMode) {
		return (
			<StrictMode>
				<I18nProvider i18n={i18n}>{children.props.children}</I18nProvider>
			</StrictMode>
		);
	}
	return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}

vi.mock("@lingui/core/macro", () => ({
	t: (strings: TemplateStringsArray, ...values: unknown[]) =>
		strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, ""),
}));

vi.mock("sonner", () => ({
	toast: {
		dismiss: testState.toastDismiss,
		error: testState.toastError,
		loading: testState.toastLoading,
		success: testState.toastSuccess,
	},
}));

vi.mock("@/hooks/wallet/use-email-embedded-wallet", () => ({
	useEmailEmbeddedWallet: () => ({
		emailAddress: "user@example.com",
		embeddedWalletAddress: testState.owner,
		shouldUseEmbeddedWallet: true,
		needsEmbeddedWallet: false,
		isCreatingEmbeddedWallet: false,
		embeddedWalletError: null,
		ensureEmailEmbeddedWallet: vi.fn(),
	}),
}));

vi.mock("@/hooks/trade/use-usdc-routing", () => ({
	UsdcDepositRouteError: class UsdcDepositRouteError extends Error {
		readonly reason: "changed" | "unavailable";

		constructor(reason: "changed" | "unavailable") {
			super(reason);
			this.name = "UsdcDepositRouteError";
			this.reason = reason;
		}
	},
	useUsdcRouting: (enabled: boolean) => {
		testState.routingQueryEnabled = enabled;
		return {
			data: testState.routingData,
			isError: testState.routingIsError,
			isFetching: testState.routingIsFetching,
		};
	},
}));

vi.mock("@/hooks/trade/use-cctp-deposit-tracking", () => ({
	useCctpDepositTracking: (options: Record<string, unknown>) => {
		testState.trackingOptions = options;
		return { recoveryRecord: testState.trackingRecoveryRecord };
	},
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalOpen: () => testState.depositModalOpen,
}));

vi.mock("@/config/cctp-deposit", () => ({
	isCctpSponsoredDepositEnabled: () => testState.sponsoredEnabled,
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useIsTestnet: () => testState.isTestnet,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		user: { email: { address: "user@example.com" } },
		embeddedWalletAddress: testState.owner,
		walletIntent: testState.walletIntent,
	}),
}));

vi.mock("@/lib/wallet/privy-wagmi", () => ({
	getPrivyEmailAddress: () => "user@example.com",
}));

vi.mock("@/lib/hyperliquid/use-deposit", () => ({
	useDeposit: (options: Record<string, unknown>) => {
		testState.useDepositOptions = options;
		return {
			maxDepositRaw: testState.maxDepositRaw,
			status: testState.depositStatus,
			error: testState.depositError,
			hash: testState.depositHash,
			deposit: testState.deposit,
			refreshBalance: testState.refreshBalance,
			reset: testState.resetDeposit,
			networkName: "Arbitrum",
			sponsoredCctpEnabled: testState.sponsoredEnabled && options.depositRoute === "cctp",
		};
	},
}));

describe("EmbeddedDepositAutoBridge", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		const reactRoot = createRoot(container);
		root = {
			render: (children) => reactRoot.render(withI18n(children)),
			unmount: () => reactRoot.unmount(),
		} as Root;
		testState.owner = USER_ADDRESS;
		testState.deposit.mockReset();
		testState.deposit.mockResolvedValue(undefined);
		testState.refreshBalance.mockReset();
		testState.refreshBalance.mockResolvedValue(9_000_000n);
		testState.resetDeposit.mockReset();
		testState.toastDismiss.mockReset();
		testState.toastError.mockReset();
		testState.toastLoading.mockReset();
		testState.toastSuccess.mockReset();
		testState.depositError = null;
		testState.depositHash = undefined;
		testState.depositModalOpen = false;
		testState.depositStatus = "idle";
		testState.isTestnet = true;
		testState.maxDepositRaw = 9_000_000n;
		testState.routingData = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.routingIsError = false;
		testState.routingIsFetching = false;
		testState.routingQueryEnabled = undefined;
		testState.sponsoredEnabled = true;
		testState.useDepositOptions = null;
		testState.trackingOptions = null;
		testState.trackingRecoveryRecord = null;
		testState.walletIntent = "embedded";
		Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("does not retry an automatic deposit after a transaction hash exists", async () => {
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});
		expect(testState.deposit).toHaveBeenCalledTimes(1);

		testState.depositStatus = "error";
		testState.depositError = new Error("confirmation failed");
		testState.depositHash = HASH;
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));

		expect(testState.deposit).toHaveBeenCalledTimes(1);
		expect(testState.resetDeposit).not.toHaveBeenCalled();
	});

	it.each([
		{ name: "the route query is pending", data: null, isError: false, isFetching: true },
		{ name: "the route query fails", data: null, isError: true, isFetching: false },
		{ name: "the route response is unknown", data: null, isError: false, isFetching: false },
		{
			name: "the retired Bridge2 route is returned",
			data: { depositRoute: "bridge" as const, withdrawalRoute: "cctp" as const },
			isError: false,
			isFetching: false,
		},
	])("does not submit when $name", async ({ data, isError, isFetching }) => {
		testState.routingData = data;
		testState.routingIsError = isError;
		testState.routingIsFetching = isFetching;

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.deposit).not.toHaveBeenCalled();
	});

	it("submits only when the current deposit route is CCTP", async () => {
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.deposit).toHaveBeenCalledWith("9");
	});

	it("never initiates a mainnet deposit from the application-wide recovery host", async () => {
		testState.isTestnet = false;

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.routingQueryEnabled).toBe(false);
		expect(testState.useDepositOptions).toMatchObject({ balanceEnabled: false });
		expect(testState.refreshBalance).not.toHaveBeenCalled();
		expect(testState.deposit).not.toHaveBeenCalled();
		expect(testState.trackingOptions).toMatchObject({
			enabled: true,
			env: "Mainnet",
			owner: USER_ADDRESS,
		});
	});

	it("releases an aborted development attempt before the StrictMode effect replay", async () => {
		await act(async () => {
			root.render(createElement(StrictMode, null, createElement(EmbeddedDepositAutoBridge)));
		});

		expect(testState.refreshBalance).toHaveBeenCalledTimes(2);
		expect(testState.deposit).toHaveBeenCalledTimes(1);
		expect(testState.deposit).toHaveBeenCalledWith("9");
	});

	it("does not submit when sponsored CCTP is disabled", async () => {
		testState.sponsoredEnabled = false;

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.deposit).not.toHaveBeenCalled();
		expect(testState.useDepositOptions).toMatchObject({ balanceEnabled: false });
		expect(testState.routingQueryEnabled).toBe(false);
		expect(testState.trackingOptions).toMatchObject({
			enabled: true,
			env: "Testnet",
			owner: USER_ADDRESS,
			removeOnForwardSubmitted: true,
		});
	});

	it("keeps recovery active while the deposit modal owns the completion screen", async () => {
		testState.depositModalOpen = true;
		testState.trackingRecoveryRecord = { sourceHash: HASH };

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.deposit).not.toHaveBeenCalled();
		expect(testState.useDepositOptions).toMatchObject({ balanceEnabled: false });
		expect(testState.trackingOptions).toMatchObject({
			enabled: true,
			removeOnForwardSubmitted: false,
		});
	});

	it("starts the next automatic deposit only after global recovery tracking completes", async () => {
		testState.trackingRecoveryRecord = { sourceHash: HASH };

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.deposit).not.toHaveBeenCalled();
		expect(testState.useDepositOptions).toMatchObject({ balanceEnabled: false });
		expect(testState.trackingOptions).toMatchObject({
			enabled: true,
			removeOnForwardSubmitted: true,
		});

		testState.trackingRecoveryRecord = null;
		testState.maxDepositRaw = 8_000_000n;
		testState.refreshBalance.mockResolvedValue(8_000_000n);
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.deposit).toHaveBeenCalledTimes(1);
		expect(testState.deposit).toHaveBeenCalledWith("8");
	});

	it.each([
		{ name: "the route query is loading", data: null, isError: false, isFetching: true },
		{
			name: "the retired Bridge2 route is returned",
			data: { depositRoute: "bridge" as const, withdrawalRoute: "cctp" as const },
			isError: false,
			isFetching: false,
		},
	])("does not poll the embedded balance when $name", async ({ data, isError, isFetching }) => {
		testState.routingData = data;
		testState.routingIsError = isError;
		testState.routingIsFetching = isFetching;

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.useDepositOptions).toMatchObject({ balanceEnabled: false });
	});

	it("uses the balance refreshed inside the exclusive section", async () => {
		testState.refreshBalance.mockResolvedValue(6_000_000n);

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.refreshBalance).toHaveBeenCalledTimes(1);
		expect(testState.deposit).toHaveBeenCalledWith("6");
	});

	it("aborts an in-flight automatic deposit when the Privy wallet intent becomes ambiguous", async () => {
		let resolveBalance: ((balance: bigint) => void) | undefined;
		testState.refreshBalance.mockReturnValueOnce(
			new Promise<bigint>((resolve) => {
				resolveBalance = resolve;
			}),
		);

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});
		testState.walletIntent = "ambiguous";
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});
		await act(async () => {
			resolveBalance?.(9_000_000n);
			await Promise.resolve();
		});

		expect(testState.deposit).not.toHaveBeenCalled();
	});

	it("skips an automatic deposit when the refreshed balance is below the minimum", async () => {
		testState.refreshBalance.mockResolvedValue(4_000_000n);

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.refreshBalance).toHaveBeenCalledTimes(1);
		expect(testState.deposit).not.toHaveBeenCalled();
	});

	it("backs off when the balance cannot be refreshed inside the exclusive section", async () => {
		testState.refreshBalance.mockResolvedValue(undefined);

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.deposit).not.toHaveBeenCalled();
		expect(testState.resetDeposit).not.toHaveBeenCalled();

		await act(() => vi.advanceTimersByTimeAsync(30_000));

		expect(testState.resetDeposit).toHaveBeenCalledTimes(1);
	});

	it("does not automatically resubmit after a no-hash sponsored submission error", async () => {
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});
		expect(testState.deposit).toHaveBeenCalledTimes(1);

		testState.depositStatus = "error";
		testState.depositError = new Error("provider unavailable");
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		testState.routingIsFetching = true;
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});
		await act(() => vi.advanceTimersByTimeAsync(30_000));

		expect(testState.deposit).toHaveBeenCalledTimes(1);
		expect(testState.resetDeposit).not.toHaveBeenCalled();
	});

	it("serializes automatic deposits across mounted tabs and rechecks the balance", async () => {
		let queue = Promise.resolve<unknown>(undefined);
		const request = vi.fn(
			(_name: string, _options: LockOptions, callback: (lock: Lock) => Promise<unknown>): Promise<unknown> => {
				const current = queue.then(() => callback({ mode: "exclusive", name: _name }));
				queue = current.catch(() => undefined);
				return current;
			},
		);
		Object.defineProperty(navigator, "locks", {
			configurable: true,
			value: { query: vi.fn(), request },
		});
		testState.refreshBalance.mockResolvedValueOnce(9_000_000n).mockResolvedValueOnce(0n);

		await act(async () => {
			root.render(
				createElement(
					Fragment,
					null,
					createElement(EmbeddedDepositAutoBridge, { key: "first" }),
					createElement(EmbeddedDepositAutoBridge, { key: "second" }),
				),
			);
		});

		expect(request).toHaveBeenCalledTimes(2);
		expect(testState.refreshBalance).toHaveBeenCalledTimes(2);
		expect(testState.deposit).toHaveBeenCalledTimes(1);
	});

	it("reconciles smart-wallet nonce conflicts without exposing provider payloads", async () => {
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		testState.depositStatus = "error";
		testState.depositError = new Error(
			"RPC Request failed. URL: https://rpc.zerodev.app/private Details: AA25 invalid account nonce callData: 0xdeadbeef",
		);

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.refreshBalance).toHaveBeenCalledTimes(2);
		expect(testState.toastError).toHaveBeenCalledWith(
			"Smart wallet deposit state is syncing. Do not submit another deposit while the balance is being checked.",
			expect.objectContaining({ id: NOTIFICATION_ID }),
		);
		expect(testState.toastError.mock.calls.flat().join(" ")).not.toContain("rpc.zerodev.app");
		expect(testState.toastError.mock.calls.flat().join(" ")).not.toContain("callData");
	});

	it("localizes typed deposit-route failures instead of exposing their fixed English message", async () => {
		i18n.loadAndActivate({ locale: "ar", messages: arabicMessages });
		testState.depositStatus = "error";
		testState.depositError = new UsdcDepositRouteError("changed");

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.toastError).toHaveBeenCalledWith(
			DEPOSIT_ROUTE_CHANGED_AR,
			expect.objectContaining({ id: NOTIFICATION_ID }),
		);
		expect(testState.toastError.mock.calls.flat()).not.toContain(DEPOSIT_ROUTE_CHANGED);
	});

	it("localizes a deposit failure raised by the deposit flow when it is reported", async () => {
		i18n.loadAndActivate({ locale: "ar", messages: arabicMessages });
		testState.depositStatus = "error";
		testState.depositError = new LocalizedActionError({
			id: getMessageId(FAST_TRANSFER_UNAVAILABLE),
			message: FAST_TRANSFER_UNAVAILABLE,
		});

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.toastError).toHaveBeenCalledWith(
			FAST_TRANSFER_UNAVAILABLE_AR,
			expect.objectContaining({ id: NOTIFICATION_ID }),
		);
	});

	it("reports an unrecognised failure with the automatic deposit message instead of its raw text", async () => {
		testState.depositStatus = "error";
		testState.depositError = new Error("Paymaster policy rejected sponsored call");

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.toastError).toHaveBeenCalledWith(
			"Automatic USDC deposit failed",
			expect.objectContaining({ id: NOTIFICATION_ID }),
		);
		expect(testState.toastError.mock.calls.flat().join(" ")).not.toContain("Paymaster");
	});

	it("dismisses an active loading toast when the deposit returns to idle", async () => {
		testState.depositStatus = "pending";

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.toastLoading).toHaveBeenCalledWith(
			"Preparing automatic USDC deposit...",
			expect.objectContaining({ id: NOTIFICATION_ID }),
		);

		testState.depositStatus = "idle";
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.toastDismiss).toHaveBeenCalledWith(NOTIFICATION_ID);
	});

	it("keeps a completed deposit toast available for normal auto-dismiss", async () => {
		testState.depositStatus = "pending";
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		testState.depositStatus = "success";
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		testState.depositStatus = "idle";
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.toastSuccess).toHaveBeenCalledWith(
			"USDC deposit confirmed on Arbitrum",
			expect.objectContaining({ id: NOTIFICATION_ID }),
		);
		expect(testState.toastDismiss).not.toHaveBeenCalled();
	});

	it.each([
		["success", "account"],
		["error", "account"],
		["success", "network"],
		["error", "network"],
		["success", "disconnect"],
		["error", "disconnect"],
		["success", "unmount"],
		["error", "unmount"],
	] as const)("dismisses a terminal %s notification on %s change", async (status, change) => {
		testState.depositStatus = status;
		testState.depositError = status === "error" ? new Error("Deposit rejected") : null;
		await act(async () => root.render(createElement(EmbeddedDepositAutoBridge)));
		const notification = status === "success" ? testState.toastSuccess : testState.toastError;
		expect(notification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ id: NOTIFICATION_ID }));

		testState.depositStatus = "idle";
		if (change === "account") testState.owner = "0x2222222222222222222222222222222222222222";
		if (change === "network") testState.isTestnet = false;
		if (change === "disconnect") testState.walletIntent = "unavailable";
		await act(async () => root.render(change === "unmount" ? null : createElement(EmbeddedDepositAutoBridge)));
		expect(testState.toastDismiss).toHaveBeenCalledWith(NOTIFICATION_ID);
	});
});
