// @vitest-environment jsdom

import { ApiRequestError } from "@nktkas/hyperliquid";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnifiedAccountAutoSetup } from "@/components/trade/components/unified-account-auto-setup";
import {
	ACCOUNT_MODE_SETUP_RETRY_DELAY_MS,
	ACCOUNT_MODE_SETUP_SETTLED_GRACE_MS,
} from "@/domain/trade/account-mode-setup";
import { useAccountModeSetupKind } from "@/hooks/trade/use-account-mode-setup";
import {
	getAccountModeSetupAttemptStatus,
	resetAccountModeSetupAttempts,
} from "@/lib/trade/account-mode-setup-attempts";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_OWNER = "0x2222222222222222222222222222222222222222" as const;
const BUILDER = "0x9999999999999999999999999999999999999999" as const;

type Method = "agentSetAbstraction" | "userSetAbstraction";
type Outcome = { kind: "resolve" } | { kind: "reject"; error: unknown } | { kind: "hold" };

interface Call {
	method: Method;
	params: unknown;
	signed: boolean;
}

type DexStates = [string, { marginSummary: { accountValue: string } }][];

function fundedBalances() {
	return {
		accountAbstraction: "default" as unknown,
		isLoading: false,
		hasError: false,
		hasAllDexsSnapshot: true,
		hasSpotStateSnapshot: true,
		perpStateStatus: "success" as "success" | "loading" | "stale" | "error",
		spotStateStatus: "success" as "success" | "loading" | "stale" | "error",
		marginSummary: { accountValue: "25" } as { accountValue: string } | undefined,
		allDexClearinghouseStates: [["", { marginSummary: { accountValue: "25" } }]] as DexStates,
		spotBalances: [] as { total: string }[],
	};
}

function emptyBalances() {
	return {
		...fundedBalances(),
		marginSummary: { accountValue: "0" },
		allDexClearinghouseStates: [["", { marginSummary: { accountValue: "0" } }]] as DexStates,
	};
}

const HISTORY_EMPTY = { data: [] as unknown, isError: false, isFetching: false, isSuccess: true };
const HISTORY_IDLE = { data: undefined as unknown, isError: false, isFetching: false, isSuccess: false };

const testState = vi.hoisted(() => {
	const listeners = new Set<() => void>();
	const guards: Record<string, ((params: unknown, signal: AbortSignal) => Promise<void>) | undefined> = {};
	const executionGuards: Record<string, ((params: unknown) => void) | undefined> = {};
	const state = {
		version: 0,
		address: "0x1111111111111111111111111111111111111111" as string | undefined,
		sessionMode: "wallet" as "wallet" | "agent-only",
		infoAbstraction: "default" as unknown,
		balances: null as unknown,
		signer: { isSignerReady: true, isSignerLoading: false, signerMode: "owner" as "owner" | "agent" },
		legal: { userAllowed: true, canPerformActions: true, acceptedTerms: true } as
			| { userAllowed: boolean; canPerformActions: boolean; acceptedTerms: boolean }
			| undefined,
		orderHistory: { data: [] as unknown, isError: false, isFetching: false, isSuccess: true },
		orderHistoryEnabled: undefined as boolean | undefined,
		modeObserver: null as null | { user: string; enabled: boolean; polls: boolean },
		freshAbstraction: "default" as unknown,
		freshGate: null as Promise<void> | null,
		freshOrderHistory: [] as unknown,
		freshOrderHistoryError: null as unknown,
		freshOrderHistoryReads: 0,
		outcomes: [] as unknown[],
		calls: [] as unknown[],
		held: [] as { resolve: () => void; reject: (error: unknown) => void }[],
	};
	return {
		state,
		guards,
		executionGuards,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		set(patch: Partial<typeof state>) {
			Object.assign(state, patch);
			state.version += 1;
			for (const listener of listeners) listener();
		},
	};
});

async function runExchange(method: Method, params: unknown): Promise<void> {
	const call: Call = { method, params, signed: false };
	const preExecutionGuard = testState.guards[method];
	const executionGuard = testState.executionGuards[method];
	testState.state.calls.push(call);
	executionGuard?.(params);
	await preExecutionGuard?.(params, new AbortController().signal);
	executionGuard?.(params);
	call.signed = true;
	const outcome = (testState.state.outcomes.shift() as Outcome | undefined) ?? { kind: "resolve" };
	if (outcome.kind === "reject") throw outcome.error;
	if (outcome.kind === "hold") {
		await new Promise<void>((resolve, reject) => {
			testState.state.held.push({ resolve, reject });
		});
	}
}

const exchangeMutations = {
	agentSetAbstraction: (params: unknown) => runExchange("agentSetAbstraction", params),
	userSetAbstraction: (params: unknown) => runExchange("userSetAbstraction", params),
};

vi.mock("@/config/hyperliquid", () => ({
	DEFAULT_BUILDER_CONFIG: { b: "0x9999999999999999999999999999999999999999", f: 10 },
}));

vi.mock("@/hooks/wallet/use-wallet-session", async () => {
	const { useSyncExternalStore } = await import("react");
	return {
		useWalletSession: () => {
			useSyncExternalStore(testState.subscribe, () => testState.state.version);
			// An Agent-only session has an owner address without wallet access; the host must not depend on it.
			return { address: testState.state.address, hasWalletAccess: testState.state.sessionMode === "wallet" };
		},
	};
});

vi.mock("@/hooks/trade/use-account-balances", async () => {
	const { useSyncExternalStore } = await import("react");
	return {
		normalizeAccountAbstraction: (value: unknown) => (value === "default" ? "default" : (value ?? null)),
		useDefaultDexBalances: () => {
			useSyncExternalStore(testState.subscribe, () => testState.state.version);
			return testState.state.balances;
		},
	};
});

vi.mock("@/hooks/trade/use-account-abstraction-guard", () => ({
	fetchFreshAccountAbstraction: vi.fn(async () => {
		if (testState.state.freshGate) await testState.state.freshGate;
		return testState.state.freshAbstraction;
	}),
}));

vi.mock("@/lib/hyperliquid", async () => {
	const { useSyncExternalStore } = await import("react");
	const testInfo = {
		historicalOrders: async () => {
			testState.state.freshOrderHistoryReads += 1;
			if (testState.state.freshOrderHistoryError) throw testState.state.freshOrderHistoryError;
			return testState.state.freshOrderHistory;
		},
	};
	function useTestState() {
		useSyncExternalStore(testState.subscribe, () => testState.state.version);
		return testState.state;
	}
	return {
		infoKey: (method: string, params: unknown, env: string) => ["hl", "info", method, params, env],
		useHyperliquid: () => ({ env: "Mainnet", info: testInfo, sessionMode: useTestState().sessionMode }),
		useLegalStatus: () => ({ data: useTestState().legal }),
		useTradingStatus: () => useTestState().signer,
		useInfo: (
			method: string,
			params: { user: string },
			options: { enabled: boolean; refetchInterval?: unknown; select?: (value: unknown) => unknown },
		) => {
			const state = useTestState();
			if (method === "userAbstraction") {
				// The page-level observer must not poll: the runner's balances hook does while it is mounted.
				state.modeObserver = {
					user: params.user,
					enabled: options.enabled,
					polls: options.refetchInterval !== undefined,
				};
				const raw = options.enabled ? state.infoAbstraction : undefined;
				return { data: options.select ? options.select(raw) : raw };
			}
			state.orderHistoryEnabled = options.enabled;
			return options.enabled
				? state.orderHistory
				: { data: undefined, isError: false, isFetching: false, isSuccess: false };
		},
		useExchange: (
			method: Method,
			options: {
				executionGuard?: (typeof testState.executionGuards)[string];
				preExecutionGuard?: (typeof testState.guards)[string];
			},
		) => {
			useTestState();
			testState.guards[method] = options.preExecutionGuard;
			testState.executionGuards[method] = options.executionGuard;
			return { mutateAsync: exchangeMutations[method] };
		},
	};
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function attemptStatus(owner: string = OWNER) {
	return getAccountModeSetupAttemptStatus(`Mainnet:${owner}`);
}

function calls(): Call[] {
	return testState.state.calls as Call[];
}

function signedCalls(): Call[] {
	return calls().filter((call) => call.signed);
}

function PublishedKind({ owner }: { owner: string }) {
	const kind = useAccountModeSetupKind("default", owner);
	return <output data-testid={owner}>{kind}</output>;
}

function publishedKind(owner: string = OWNER): string | null {
	return document.querySelector(`[data-testid="${owner}"]`)?.textContent ?? null;
}

function terminalRejection(text: string) {
	return new ApiRequestError({ status: "err", response: text }, text);
}

describe("UnifiedAccountAutoSetup (ADR 0041)", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;

	function tree(children?: ReactNode) {
		return (
			<QueryClientProvider client={queryClient}>
				<UnifiedAccountAutoSetup />
				<PublishedKind owner={OWNER} />
				<PublishedKind owner={OTHER_OWNER} />
				{children}
			</QueryClientProvider>
		);
	}

	async function render(strict = false) {
		await act(async () => root.render(strict ? <StrictMode>{tree()}</StrictMode> : tree()));
	}

	async function update(patch: Parameters<typeof testState.set>[0]) {
		await act(async () => testState.set(patch));
	}

	async function advance(ms: number) {
		await act(async () => {
			await vi.advanceTimersByTimeAsync(ms);
		});
	}

	beforeEach(() => {
		vi.useFakeTimers();
		resetAccountModeSetupAttempts();
		for (const key of Object.keys(testState.guards)) delete testState.guards[key];
		for (const key of Object.keys(testState.executionGuards)) delete testState.executionGuards[key];
		testState.set({
			address: OWNER,
			sessionMode: "wallet",
			infoAbstraction: "default",
			balances: fundedBalances(),
			signer: { isSignerReady: true, isSignerLoading: false, signerMode: "owner" },
			legal: { userAllowed: true, canPerformActions: true, acceptedTerms: true },
			orderHistory: HISTORY_EMPTY,
			orderHistoryEnabled: undefined,
			modeObserver: null,
			freshAbstraction: "default",
			freshGate: null,
			freshOrderHistory: [],
			freshOrderHistoryError: null,
			freshOrderHistoryReads: 0,
			outcomes: [],
			calls: [],
			held: [],
		});
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		queryClient.clear();
		resetAccountModeSetupAttempts();
		vi.useRealTimers();
	});

	it("sets a funded new email account to Unified account with one owner-signed request", async () => {
		await render();

		expect(signedCalls()).toEqual([
			{ method: "userSetAbstraction", params: { user: OWNER, abstraction: "unifiedAccount" }, signed: true },
		]);
		expect(attemptStatus()).toBe("settled");
		expect(queryClient.getQueryData(["hl", "info", "userAbstraction", { user: OWNER }, "Mainnet"])).toBe(
			"unifiedAccount",
		);
		await advance(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS * 4);
		expect(calls()).toHaveLength(1);
	});

	it("sets a funded new external-wallet account with one Agent-signed request", async () => {
		testState.set({ signer: { isSignerReady: true, isSignerLoading: false, signerMode: "agent" } });
		await render();

		expect(signedCalls()).toEqual([{ method: "agentSetAbstraction", params: { abstraction: "u" }, signed: true }]);
		expect(attemptStatus()).toBe("settled");
	});

	it.each([
		["the account has no funds yet", { balances: emptyBalances() }, "awaiting-funds"],
		[
			"the funding snapshot is loading",
			{ balances: { ...fundedBalances(), marginSummary: undefined, isLoading: true } },
			"pending",
		],
		["the spot snapshot is missing", { balances: { ...emptyBalances(), hasSpotStateSnapshot: false } }, "pending"],
		["the funding snapshot failed", { balances: { ...emptyBalances(), hasError: true } }, "pending"],
		[
			"a positive balance comes with a missing spot snapshot",
			{ balances: { ...fundedBalances(), hasSpotStateSnapshot: false, spotStateStatus: "loading" } },
			"pending",
		],
		[
			"a positive balance comes with a failed snapshot",
			{ balances: { ...fundedBalances(), hasError: true, spotStateStatus: "error" } },
			"pending",
		],
		[
			"a positive balance comes from a stale perpetual snapshot",
			{ balances: { ...fundedBalances(), perpStateStatus: "stale" } },
			"pending",
		],
		[
			"a positive balance comes from a stale spot snapshot",
			{ balances: { ...fundedBalances(), spotStateStatus: "stale" } },
			"pending",
		],
		["a positive balance is still loading", { balances: { ...fundedBalances(), isLoading: true } }, "pending"],
		[
			"an empty conclusion comes from a stale snapshot",
			{ balances: { ...emptyBalances(), spotStateStatus: "stale" } },
			"pending",
		],
		["the legal status is unknown", { legal: undefined }, "pending"],
		[
			"the terms are not accepted",
			{ legal: { userAllowed: true, canPerformActions: true, acceptedTerms: false } },
			"pending",
		],
		[
			"the account may not perform actions",
			{ legal: { userAllowed: true, canPerformActions: false, acceptedTerms: true } },
			"manual",
		],
		[
			"the user is not allowed",
			{ legal: { userAllowed: false, canPerformActions: true, acceptedTerms: true } },
			"manual",
		],
		[
			"the signer is still loading",
			{ signer: { isSignerReady: false, isSignerLoading: true, signerMode: "agent" } },
			"pending",
		],
		[
			"the Agent is not established",
			{ signer: { isSignerReady: false, isSignerLoading: false, signerMode: "agent" } },
			"manual",
		],
		["the order history is loading", { orderHistory: { ...HISTORY_IDLE, isFetching: true } }, "pending"],
		["the order history is refetching", { orderHistory: { ...HISTORY_EMPTY, isFetching: true } }, "pending"],
		["the order history failed", { orderHistory: { ...HISTORY_IDLE, isError: true } }, "manual"],
		["the order history has not answered yet", { orderHistory: HISTORY_IDLE }, "pending"],
		[
			"the order history answer is not a list",
			{ orderHistory: { ...HISTORY_EMPTY, data: { unexpected: true } } },
			"manual",
		],
		[
			"only a cached summary shows funds",
			{ balances: { ...emptyBalances(), marginSummary: { accountValue: "25" } } },
			"manual",
		],
		["the account already has orders", { orderHistory: { ...HISTORY_EMPTY, data: [{ order: {} }] } }, "manual"],
		["the session is Agent-only", { sessionMode: "agent-only" }, "manual"],
		["the owner is the builder address", { address: BUILDER }, null],
		[
			"the resolved mode conflicts with the request",
			{ balances: { ...fundedBalances(), accountAbstraction: null } },
			"not-applicable",
		],
	] as const)("does not sign while %s", async (_name, patch, kind) => {
		testState.set(patch as Parameters<typeof testState.set>[0]);
		await render();
		await advance(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS * 4);

		expect(calls()).toEqual([]);
		if (kind) expect(publishedKind()).toBe(kind);
	});

	it.each([
		["the request reports another mode", { infoAbstraction: "unifiedAccount" }],
		["the request reports the legacy DEX mode", { infoAbstraction: "dexAbstraction" }],
		["the request has no answer", { infoAbstraction: undefined }],
		["there is no address", { address: undefined }],
	] as const)("does not mount the runner when %s", async (_name, patch) => {
		testState.set(patch as Parameters<typeof testState.set>[0]);
		await render();
		await advance(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS * 4);

		expect(calls()).toEqual([]);
		expect(testState.state.orderHistoryEnabled).toBeUndefined();
	});

	it("reads the account mode once per page for the exact session address, without a polling timer of its own", async () => {
		testState.set({ infoAbstraction: "unifiedAccount" });
		await render();
		expect(testState.state.modeObserver).toEqual({ user: OWNER, enabled: true, polls: false });

		await update({ address: undefined });
		expect(testState.state.modeObserver).toEqual({ user: "", enabled: false, polls: false });
		expect(calls()).toEqual([]);
	});

	it("treats the builder address as manual and never reads its order history", async () => {
		testState.set({ address: BUILDER });
		function BuilderKind() {
			return <PublishedKind owner={BUILDER} />;
		}
		await act(async () => root.render(tree(<BuilderKind />)));

		expect(publishedKind(BUILDER)).toBe("manual");
		expect(testState.state.orderHistoryEnabled).toBe(false);
		expect(calls()).toEqual([]);
	});

	it("reads the order history only once the account is funded, then signs when it turns out empty", async () => {
		testState.set({
			balances: emptyBalances(),
			orderHistory: { ...HISTORY_IDLE, isFetching: true },
		});
		await render();
		expect(testState.state.orderHistoryEnabled).toBe(false);
		expect(publishedKind()).toBe("awaiting-funds");

		await update({ balances: fundedBalances() });
		expect(testState.state.orderHistoryEnabled).toBe(true);
		expect(publishedKind()).toBe("pending");
		expect(calls()).toEqual([]);

		await update({ orderHistory: HISTORY_EMPTY });
		expect(signedCalls()).toHaveLength(1);
	});

	it("does not sign when the mode read inside the funds lock is no longer the protocol default", async () => {
		testState.set({ freshAbstraction: "disabled" });
		const invalidate = vi.spyOn(queryClient, "invalidateQueries");
		await render();

		expect(calls()).toHaveLength(1);
		expect(signedCalls()).toEqual([]);
		expect(attemptStatus()).toBe("settled");
		expect(invalidate).toHaveBeenCalledWith({
			queryKey: ["hl", "info", "userAbstraction", { user: OWNER }, "Mainnet"],
			exact: true,
		});
		expect(queryClient.getQueryData(["hl", "info", "userAbstraction", { user: OWNER }, "Mainnet"])).toBeUndefined();
		await advance(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS * 4);
		expect(calls()).toHaveLength(1);
	});

	it("signs for an account whose funds sit in spot only", async () => {
		testState.set({ balances: { ...emptyBalances(), spotBalances: [{ total: "12" }] } });
		await render();

		expect(signedCalls()).toHaveLength(1);
	});

	it("signs nothing when a condition stops holding while the request waits for the funds lock", async () => {
		let release = () => {};
		testState.set({
			freshGate: new Promise<void>((resolve) => {
				release = resolve;
			}),
		});
		await render();
		expect(calls()).toHaveLength(1);
		expect(signedCalls()).toEqual([]);

		await update({ balances: { ...fundedBalances(), spotStateStatus: "stale" } });
		await act(async () => release());
		expect(signedCalls()).toEqual([]);
		expect(attemptStatus()).toBe("waiting");

		await update({ balances: fundedBalances(), freshGate: null });
		await advance(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS);
		expect(signedCalls()).toHaveLength(1);
		expect(attemptStatus()).toBe("settled");
	});

	it("signs nothing for an account whose host went away while its request waited", async () => {
		let release = () => {};
		testState.set({
			freshGate: new Promise<void>((resolve) => {
				release = resolve;
			}),
		});
		await render();
		await update({ address: OTHER_OWNER });
		expect(calls()).toHaveLength(2);

		await act(async () => release());
		expect(signedCalls()).toEqual([
			{ method: "userSetAbstraction", params: { user: OTHER_OWNER, abstraction: "unifiedAccount" }, signed: true },
		]);
		expect(attemptStatus()).toBe("waiting");
		expect(attemptStatus(OTHER_OWNER)).toBe("settled");
	});

	it("re-reads the order history inside the funds lock and stops for good when the account has traded", async () => {
		testState.set({ freshOrderHistory: [{ order: { oid: 1 } }] });
		await render();

		expect(testState.state.freshOrderHistoryReads).toBe(1);
		expect(calls()).toHaveLength(1);
		expect(signedCalls()).toEqual([]);
		expect(attemptStatus()).toBe("rejected");
		expect(publishedKind()).toBe("manual");
		expect(queryClient.getQueryData(["hl", "info", "historicalOrders", { user: OWNER }, "Mainnet"])).toEqual([
			{ order: { oid: 1 } },
		]);
		await advance(ACCOUNT_MODE_SETUP_SETTLED_GRACE_MS);
		expect(calls()).toHaveLength(1);
	});

	it("does not read the order history again once the mode is no longer the protocol default", async () => {
		testState.set({ freshAbstraction: "unifiedAccount" });
		await render();

		expect(testState.state.freshOrderHistoryReads).toBe(0);
		expect(signedCalls()).toEqual([]);
	});

	it.each([
		["cannot be read", { freshOrderHistoryError: new TypeError("Failed to fetch") }],
		["is not a list", { freshOrderHistory: { unexpected: true } }],
	] as const)("signs nothing and retries when the order history inside the lock %s", async (_name, patch) => {
		testState.set(patch as Parameters<typeof testState.set>[0]);
		await render();

		expect(signedCalls()).toEqual([]);
		expect(attemptStatus()).toBe("waiting");
		expect(publishedKind()).toBe("pending");

		await update({ freshOrderHistory: [], freshOrderHistoryError: null });
		await advance(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS);
		expect(signedCalls()).toHaveLength(1);
		expect(attemptStatus()).toBe("settled");
	});

	it("hands the choice back when the account still reads the protocol default long after a settled attempt", async () => {
		testState.set({ freshAbstraction: "somethingUnreadable" });
		await render();
		expect(signedCalls()).toEqual([]);
		expect(attemptStatus()).toBe("settled");
		expect(publishedKind()).toBe("pending");

		await advance(ACCOUNT_MODE_SETUP_SETTLED_GRACE_MS - 1);
		expect(publishedKind()).toBe("pending");
		await advance(1);
		expect(attemptStatus()).toBe("exhausted");
		expect(publishedKind()).toBe("manual");
		expect(calls()).toHaveLength(1);
	});

	it("counts attempts per network", async () => {
		testState.set({ outcomes: [{ kind: "reject", error: terminalRejection("Abstraction transition not allowed") }] });
		await render();

		expect(attemptStatus()).toBe("rejected");
		expect(getAccountModeSetupAttemptStatus(`Testnet:${OWNER}`)).toBe("idle");
		expect(getAccountModeSetupAttemptStatus(OWNER)).toBe("idle");
	});

	it.each(["Abstraction transition not allowed", "Cannot set abstraction for deployer or fee recipient"])(
		"stops for good after the terminal rejection %s",
		async (text) => {
			testState.set({ outcomes: [{ kind: "reject", error: terminalRejection(text) }] });
			await render();

			expect(signedCalls()).toHaveLength(1);
			expect(attemptStatus()).toBe("rejected");
			expect(publishedKind()).toBe("manual");
			await advance(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS * 4);
			expect(calls()).toHaveLength(1);
		},
	);

	it("retries an ordinary failure every five seconds and gives up after three attempts", async () => {
		const failure = { kind: "reject", error: terminalRejection("Must deposit before performing actions.") };
		testState.set({ outcomes: [failure, failure, failure, failure] });
		await render();
		expect(calls()).toHaveLength(1);
		expect(publishedKind()).toBe("pending");

		await advance(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS - 1);
		expect(calls()).toHaveLength(1);
		await advance(1);
		expect(calls()).toHaveLength(2);
		expect(publishedKind()).toBe("pending");

		await advance(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS);
		expect(calls()).toHaveLength(3);
		expect(attemptStatus()).toBe("exhausted");
		expect(publishedKind()).toBe("manual");

		await advance(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS * 4);
		expect(calls()).toHaveLength(3);
	});

	it("succeeds on a retry after a network failure", async () => {
		testState.set({ outcomes: [{ kind: "reject", error: new TypeError("Failed to fetch") }] });
		await render();
		expect(attemptStatus()).toBe("waiting");

		await advance(ACCOUNT_MODE_SETUP_RETRY_DELAY_MS);
		expect(signedCalls()).toHaveLength(2);
		expect(attemptStatus()).toBe("settled");
	});

	it("sends one request under StrictMode and across a remount", async () => {
		testState.set({ outcomes: [{ kind: "hold" }] });
		await render(true);
		expect(calls()).toHaveLength(1);

		await act(async () => root.unmount());
		root = createRoot(container);
		await render(true);
		expect(calls()).toHaveLength(1);
		expect(publishedKind()).toBe("pending");

		await act(async () => (testState.state.held as { resolve: () => void }[])[0]?.resolve());
		expect(attemptStatus()).toBe("settled");
		expect(calls()).toHaveLength(1);
	});

	it("keeps an earlier account's result out of the next account's state", async () => {
		testState.set({ outcomes: [{ kind: "hold" }, { kind: "hold" }] });
		await render();
		expect(calls()).toEqual([expect.objectContaining({ params: { user: OWNER, abstraction: "unifiedAccount" } })]);

		await update({ address: OTHER_OWNER });
		expect(calls()).toHaveLength(2);
		expect(calls()[1]).toMatchObject({ params: { user: OTHER_OWNER, abstraction: "unifiedAccount" } });
		expect(publishedKind(OTHER_OWNER)).toBe("pending");

		const held = testState.state.held as { resolve: () => void; reject: (error: unknown) => void }[];
		await act(async () => held[0]?.reject(terminalRejection("Abstraction transition not allowed")));
		expect(attemptStatus()).toBe("rejected");
		expect(attemptStatus(OTHER_OWNER)).toBe("in-flight");
		expect(publishedKind(OTHER_OWNER)).toBe("pending");

		await act(async () => held[1]?.resolve());
		expect(attemptStatus(OTHER_OWNER)).toBe("settled");
		expect(queryClient.getQueryData(["hl", "info", "userAbstraction", { user: OTHER_OWNER }, "Mainnet"])).toBe(
			"unifiedAccount",
		);
		expect(queryClient.getQueryData(["hl", "info", "userAbstraction", { user: OWNER }, "Mainnet"])).toBeUndefined();
	});

	it("withdraws its published state when the mode leaves the protocol default or the host unmounts", async () => {
		testState.set({ balances: emptyBalances() });
		await render();
		expect(publishedKind()).toBe("awaiting-funds");

		await update({ infoAbstraction: "unifiedAccount" });
		expect(publishedKind()).toBe("pending");

		await update({ infoAbstraction: "default" });
		expect(publishedKind()).toBe("awaiting-funds");
		await act(async () => root.render(<PublishedKind owner={OWNER} />));
		expect(publishedKind()).toBe("pending");
	});
});
