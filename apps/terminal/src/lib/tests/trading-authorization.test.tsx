// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { useTradingGuard } from "@sairn/hl-react/hooks/useTradingGuard";
import {
	assertExchangeSigningDeadline,
	ExchangeActionDeadlineError,
	type ExchangeSigningDeadlineSlot,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
import { PERSIST_TRADING_CONNECTION_STORAGE_KEY } from "@sairn/hl-react/signing/agent-storage";
import { deriveAgentRequirements } from "@sairn/hl-react/signing/use-agent-status";
import { useTradingAuthorization } from "@sairn/hl-react/signing/use-trading-authorization";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatTransferError } from "@/lib/errors/format";

const AGENT = "0x3333333333333333333333333333333333333333" as const;
const BUILDER = "0x2222222222222222222222222222222222222222" as const;

const testState = vi.hoisted(() => ({
	agentAddress: null as `0x${string}` | null,
	approveBuilderFee: vi.fn(),
	builderError: null as Error | null,
	builderStatus: "idle" as "idle" | "approving_fee" | "error",
	registerAgent: vi.fn(),
	refetch: vi.fn(),
	refetchAgent: vi.fn(),
}));

vi.mock("@sairn/hl-react/signing/use-agent-status", async (importOriginal) => {
	const original = await importOriginal<typeof import("@sairn/hl-react/signing/use-agent-status")>();
	return {
		...original,
		useAgentStatus: () => ({
			agentAddress: testState.agentAddress,
			refetch: testState.refetch,
			refetchAgent: testState.refetchAgent,
		}),
	};
});

vi.mock("@sairn/hl-react/provider", () => ({
	useHyperliquid: () => ({
		clientKey: "0x1111111111111111111111111111111111111111",
		env: "Mainnet",
		sessionMode: "wallet",
	}),
}));

vi.mock("@sairn/hl-react/signing/use-agent-registration", () => ({
	useAgentRegistration: () => ({
		error: null,
		register: testState.registerAgent,
		status: "idle",
	}),
}));

vi.mock("@sairn/hl-react/signing/use-builder-fee-approval", () => ({
	useBuilderFeeApproval: () => ({
		approve: testState.approveBuilderFee,
		error: testState.builderError,
		status: testState.builderStatus,
	}),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useTradingAuthorization> | null = null;

function Probe({ requiresBuilderFee = true }: { requiresBuilderFee?: boolean }) {
	hookValue = useTradingAuthorization({ requiresBuilderFee });
	return null;
}

let guardValue: ReturnType<typeof useTradingGuard> | null = null;

function GuardProbe() {
	guardValue = useTradingGuard();
	return null;
}

function requirements(needsBuilderFee: boolean, needsAgent: boolean) {
	return {
		isAgentReady: !needsAgent,
		isBuilderFeeReady: !needsBuilderFee,
		isReady: !needsBuilderFee && !needsAgent,
		needsAgent,
		needsBuilderFee,
		signaturesRequired: Number(needsBuilderFee) + Number(needsAgent),
	};
}

describe("trading authorization contracts", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient({
			defaultOptions: {
				mutations: { retry: false },
				queries: { retry: false },
			},
		});
		hookValue = null;
		testState.agentAddress = null;
		testState.approveBuilderFee.mockReset();
		testState.approveBuilderFee.mockResolvedValue(undefined);
		testState.builderError = null;
		testState.builderStatus = "idle";
		testState.registerAgent.mockReset();
		testState.registerAgent.mockResolvedValue(AGENT);
		testState.refetch.mockReset();
		testState.refetchAgent.mockReset();
		localStorage.removeItem(PERSIST_TRADING_CONNECTION_STORAGE_KEY);
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		vi.clearAllMocks();
	});

	function renderHook(requiresBuilderFee = true) {
		act(() => {
			root.render(
				createElement(QueryClientProvider, { client: queryClient }, createElement(Probe, { requiresBuilderFee })),
			);
		});
		if (!hookValue) throw new Error("Missing trading authorization hook value");
		return hookValue;
	}

	it("derives Agent and builder readiness independently", () => {
		const owner = "0x1111111111111111111111111111111111111111" as const;
		const localAgent = { privateKey: "0x01" as const, publicKey: AGENT, source: "local-registration" as const };
		const approvedKey = { agentAddress: AGENT, role: { role: "agent" as const, data: { user: owner } } };

		expect(
			deriveAgentRequirements(
				0,
				{ owner, localAgent, keyRole: approvedKey, extraAgents: undefined },
				{ b: BUILDER, f: 10 },
			),
		).toMatchObject({
			isAgentReady: true,
			isBuilderFeeReady: false,
			isReady: false,
			needsAgent: false,
			needsBuilderFee: true,
		});
		expect(
			deriveAgentRequirements(
				10,
				{ owner, localAgent, keyRole: undefined, extraAgents: undefined },
				{ b: BUILDER, f: 10 },
			),
		).toMatchObject({
			isAgentReady: false,
			isBuilderFeeReady: true,
			isReady: false,
			needsAgent: false,
			needsBuilderFee: false,
		});
		expect(
			deriveAgentRequirements(
				10,
				{ owner, localAgent: null, keyRole: approvedKey, extraAgents: undefined },
				{ b: BUILDER, f: 10 },
				Date.now(),
				AGENT,
			),
		).toMatchObject({
			isAgentReady: true,
			isBuilderFeeReady: true,
			isReady: true,
			needsAgent: false,
			needsBuilderFee: false,
		});
	});

	it("authorizes the Agent before requesting the independent builder fee", async () => {
		testState.refetch
			.mockResolvedValueOnce(requirements(true, true))
			.mockResolvedValueOnce(requirements(true, false))
			.mockResolvedValueOnce(requirements(false, false));
		const hook = renderHook();

		await act(async () => {
			await expect(hook.authorize()).resolves.toBe(AGENT);
		});

		expect(testState.approveBuilderFee).toHaveBeenCalledOnce();
		expect(testState.registerAgent).toHaveBeenCalledExactlyOnceWith({
			persistConnection: false,
			deadline: expect.objectContaining({ current: expect.any(Object) }),
		});
		expect(testState.registerAgent.mock.invocationCallOrder[0]).toBeLessThan(
			testState.approveBuilderFee.mock.invocationCallOrder[0] ?? 0,
		);
		expect(testState.refetch).toHaveBeenCalledTimes(3);
		expect(testState.refetch).toHaveBeenNthCalledWith(1);
		expect(testState.refetch).toHaveBeenNthCalledWith(2, AGENT);
		expect(testState.refetch).toHaveBeenNthCalledWith(3, AGENT);
	});

	it("skips builder approval when only Agent registration is required", async () => {
		localStorage.setItem(PERSIST_TRADING_CONNECTION_STORAGE_KEY, "true");
		testState.refetch
			.mockResolvedValueOnce(requirements(false, true))
			.mockResolvedValueOnce(requirements(false, false))
			.mockResolvedValueOnce(requirements(false, false));
		const hook = renderHook();

		await act(async () => {
			await expect(hook.authorize()).resolves.toBe(AGENT);
		});

		expect(testState.approveBuilderFee).not.toHaveBeenCalled();
		expect(testState.registerAgent).toHaveBeenCalledExactlyOnceWith({
			persistConnection: true,
			deadline: expect.objectContaining({ current: expect.any(Object) }),
		});
	});

	it("does not request builder approval for an Agent-only trading action", async () => {
		testState.agentAddress = AGENT;
		testState.builderError = new Error("Stale builder approval error");
		testState.builderStatus = "error";
		testState.refetch.mockRejectedValue(new Error("Builder fee status unavailable"));
		testState.refetchAgent.mockResolvedValue(requirements(true, false));
		const hook = renderHook(false);
		expect(hook.status).toBe("idle");
		expect(hook.error).toBeNull();

		await act(async () => {
			await expect(hook.authorize()).resolves.toBe(AGENT);
		});

		expect(testState.approveBuilderFee).not.toHaveBeenCalled();
		expect(testState.registerAgent).not.toHaveBeenCalled();
		expect(testState.refetch).not.toHaveBeenCalled();
		expect(testState.refetchAgent).toHaveBeenCalledTimes(2);
	});

	it("fails closed when the final server state is not fully authorized", async () => {
		testState.refetch.mockResolvedValue(requirements(false, true));
		const hook = renderHook();

		await act(async () => {
			await expect(hook.authorize()).rejects.toThrow("Trading authorization could not be confirmed");
		});
	});

	describe("one deadline from the explicit authorization", () => {
		const signBuilderFee = vi.fn();
		const signAgent = vi.fn();

		beforeEach(() => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
			signBuilderFee.mockReset();
			signAgent.mockReset();
			queryClient.mount();
			testState.approveBuilderFee.mockImplementation(async (deadline?: ExchangeSigningDeadlineSlot) => {
				if (!deadline) throw new Error("The authorization deadline was not passed");
				assertExchangeSigningDeadline(deadline);
				signBuilderFee();
			});
			testState.registerAgent.mockImplementation(async (options?: { deadline?: ExchangeSigningDeadlineSlot }) => {
				if (!options?.deadline) throw new Error("The authorization deadline was not passed");
				assertExchangeSigningDeadline(options.deadline);
				signAgent();
				return AGENT;
			});
		});

		afterEach(() => {
			onlineManager.setOnline(true);
			queryClient.unmount();
			vi.useRealTimers();
		});

		function pausedFirstStatus(first: ReturnType<typeof requirements>, then: ReturnType<typeof requirements>) {
			testState.refetch
				.mockImplementationOnce(() =>
					queryClient.fetchQuery({
						queryKey: ["authorization-status"],
						queryFn: async () => first,
						networkMode: "online",
						staleTime: 0,
					}),
				)
				.mockResolvedValue(then);
		}

		async function authorizeOfflineFor(ms: number) {
			const hook = renderHook();
			onlineManager.setOnline(false);
			let failure: unknown;
			await act(async () => {
				hook.authorize().catch((error: unknown) => {
					failure = error;
				});
				await vi.advanceTimersByTimeAsync(ms);
			});
			await act(async () => {
				onlineManager.setOnline(true);
				await vi.advanceTimersByTimeAsync(0);
			});
			return failure;
		}

		it("does not approve the builder fee when the first status check was paused for 120 seconds", async () => {
			pausedFirstStatus(requirements(true, false), requirements(false, false));
			const failure = await authorizeOfflineFor(120_000);
			expect(failure).toBeInstanceOf(ExchangeActionDeadlineError);
			expect(signBuilderFee).not.toHaveBeenCalled();
		});

		it("does not approve the Agent when the first status check was paused for 120 seconds", async () => {
			pausedFirstStatus(requirements(false, true), requirements(false, false));
			const failure = await authorizeOfflineFor(120_000);
			expect(failure).toBeInstanceOf(ExchangeActionDeadlineError);
			expect(signAgent).not.toHaveBeenCalled();
		});

		it("still asks for the builder fee after an Agent approval that took 20 seconds in the wallet", async () => {
			testState.refetch
				.mockResolvedValueOnce(requirements(true, true))
				.mockResolvedValueOnce(requirements(true, false))
				.mockResolvedValue(requirements(false, false));
			testState.registerAgent.mockImplementation(async (options?: { deadline?: ExchangeSigningDeadlineSlot }) => {
				if (!options?.deadline) throw new Error("The authorization deadline was not passed");
				assertExchangeSigningDeadline(options.deadline);
				signAgent();
				await new Promise((resolve) => setTimeout(resolve, 20_000));
				return AGENT;
			});
			const hook = renderHook();
			let outcome: unknown;
			await act(async () => {
				hook.authorize().then(
					(value) => {
						outcome = value;
					},
					(error: unknown) => {
						outcome = error;
					},
				);
				await vi.advanceTimersByTimeAsync(20_000);
			});

			expect(outcome).toBe(AGENT);
			expect(signAgent).toHaveBeenCalledOnce();
			expect(signBuilderFee).toHaveBeenCalledOnce();
		});

		it("holds the builder fee to the time since the Agent approval, not to a new limit of its own", async () => {
			testState.refetch.mockResolvedValueOnce(requirements(true, true)).mockImplementationOnce(async () => {
				await new Promise((resolve) => setTimeout(resolve, 16_000));
				return requirements(true, false);
			});
			const hook = renderHook();
			let failure: unknown;
			await act(async () => {
				hook.authorize().catch((error: unknown) => {
					failure = error;
				});
				await vi.advanceTimersByTimeAsync(16_000);
			});

			expect(failure).toMatchObject({ name: "TradingAuthorizationIncompleteError" });
			expect((failure as Error).cause).toBeInstanceOf(ExchangeActionDeadlineError);
			expect(formatTransferError(failure as Error, (descriptor) => i18n._(descriptor))).toBe(
				"Failed to enable trading",
			);
			expect(signAgent).toHaveBeenCalledOnce();
			expect(signBuilderFee).not.toHaveBeenCalled();
		});

		it("still says that nothing was signed when the builder fee alone was refused as too late", async () => {
			pausedFirstStatus(requirements(true, false), requirements(false, false));
			const failure = await authorizeOfflineFor(120_000);
			expect(formatTransferError(failure as Error, (descriptor) => i18n._(descriptor))).toBe(
				"The checks before this request took too long. Nothing was signed or sent. Try again.",
			);
		});

		it("approves both when the checks return within the limit", async () => {
			pausedFirstStatus(requirements(true, true), requirements(true, false));
			testState.refetch.mockResolvedValueOnce(requirements(true, false)).mockResolvedValue(requirements(false, false));
			const failure = await authorizeOfflineFor(2_000);
			expect(failure).toBeUndefined();
			expect(signAgent).toHaveBeenCalledOnce();
			expect(signBuilderFee).toHaveBeenCalledOnce();
		});
	});

	it("keeps the Enable control busy while the authorization checks wait and releases it afterwards", async () => {
		let answer = (_value: ReturnType<typeof requirements>) => {};
		testState.refetch
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						answer = resolve;
					}),
			)
			.mockResolvedValue(requirements(false, false));
		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(GuardProbe)));
		});
		const action = vi.fn();
		act(() => guardValue?.guardAction(action));
		await act(async () => {
			await vi.waitFor(() => expect(guardValue?.isEnabling).toBe(true));
		});
		expect(testState.refetch).toHaveBeenCalledOnce();

		await act(async () => {
			answer(requirements(false, false));
			await vi.waitFor(() => expect(guardValue?.isEnabling).toBe(false));
		});
		expect(action).toHaveBeenCalledOnce();
	});
});
