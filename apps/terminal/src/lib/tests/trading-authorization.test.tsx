// @vitest-environment jsdom

import { PERSIST_TRADING_CONNECTION_STORAGE_KEY } from "@sairn/hl-react/signing/agent-storage";
import { deriveAgentRequirements } from "@sairn/hl-react/signing/use-agent-status";
import { useTradingAuthorization } from "@sairn/hl-react/signing/use-trading-authorization";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
		const remoteAgent = { address: AGENT, name: "Sairn", validUntil: Date.now() + 60_000 };
		const localAgent = { privateKey: "0x01" as const, publicKey: AGENT, source: "local-registration" as const };

		expect(deriveAgentRequirements(0, [remoteAgent], localAgent, { b: BUILDER, f: 10 })).toMatchObject({
			isAgentReady: true,
			isBuilderFeeReady: false,
			isReady: false,
			needsAgent: false,
			needsBuilderFee: true,
		});
		expect(deriveAgentRequirements(10, undefined, localAgent, { b: BUILDER, f: 10 })).toMatchObject({
			isAgentReady: false,
			isBuilderFeeReady: true,
			isReady: false,
			needsAgent: false,
			needsBuilderFee: false,
		});
		expect(deriveAgentRequirements(10, [remoteAgent], null, { b: BUILDER, f: 10 }, Date.now(), AGENT)).toMatchObject({
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
		expect(testState.registerAgent).toHaveBeenCalledExactlyOnceWith({ persistConnection: false });
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
		expect(testState.registerAgent).toHaveBeenCalledExactlyOnceWith({ persistConnection: true });
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
});
