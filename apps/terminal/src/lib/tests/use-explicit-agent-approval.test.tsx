// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExplicitAgentApproval } from "@/hooks/wallet/use-explicit-agent-approval";

const OWNER = "0x1111111111111111111111111111111111111111";
const AGENT = "0x2222222222222222222222222222222222222222";
const OTHER_OWNER = "0x3333333333333333333333333333333333333333";

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve = (_value: T) => {};
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
}

const testState = vi.hoisted(() => ({
	clientApproveAgent: vi.fn(),
	captureRegistrationLease: vi.fn(),
	createExchangeClient: vi.fn(),
	createExternalAgentSigner: vi.fn(),
	createPrivyAgentSigner: vi.fn(),
	beforeSubmit: undefined as (() => Promise<void>) | undefined,
	connectedWalletAddress: "0x1111111111111111111111111111111111111111",
	embeddedWalletAddress: "0x1111111111111111111111111111111111111111",
	enforceLegalActions: false,
	env: "Mainnet" as "Mainnet" | "Testnet",
	exchangeLifecycle: { id: Symbol.for("test-provider"), active: true },
	hasWalletAccess: true,
	hasSameWalletAddress: true,
	isRegistrationLeaseCurrent: vi.fn(),
	signTypedData: vi.fn(),
	startRegistrationExecution: vi.fn(),
	verifyLegalActionAllowed: vi.fn(),
	walletAddress: "0x1111111111111111111111111111111111111111",
	walletClient: {
		account: { address: "0x1111111111111111111111111111111111111111" },
	} as { account: { address: string } } | undefined,
	walletIntent: "embedded" as "embedded" | "external" | "ambiguous" | "unavailable",
}));

vi.mock("@privy-io/react-auth", () => ({
	useSignTypedData: () => ({ signTypedData: testState.signTypedData }),
}));

vi.mock("wagmi", () => ({
	useWalletClient: () => ({ data: testState.walletClient }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	captureAgentRegistrationExecutionLease: testState.captureRegistrationLease,
	createExchangeClient: testState.createExchangeClient,
	isAgentRegistrationExecutionLeaseCurrent: testState.isRegistrationLeaseCurrent,
	startAgentRegistrationExecution: testState.startRegistrationExecution,
	verifyLegalActionAllowed: testState.verifyLegalActionAllowed,
	useHyperliquid: () => ({
		enforceLegalActions: testState.enforceLegalActions,
		env: testState.env,
		exchangeLifecycle: testState.exchangeLifecycle,
		info: { legalCheck: vi.fn() },
	}),
}));

vi.mock("@/lib/wallet/privy-agent-signer", () => ({
	createPrivyAgentSigner: testState.createPrivyAgentSigner,
}));

vi.mock("@/lib/wallet/external-agent-signer", () => ({
	createExternalAgentSigner: testState.createExternalAgentSigner,
}));

vi.mock("@/lib/wallet/privy-wagmi", () => ({
	hasSameWalletAddress: (left: string | undefined, right: string | undefined) =>
		testState.hasSameWalletAddress && !!left && !!right && left.toLowerCase() === right.toLowerCase(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		connectedWalletAddress: testState.connectedWalletAddress,
		embeddedWalletAddress: testState.embeddedWalletAddress,
		hasWalletAccess: testState.hasWalletAccess,
		walletAddress: testState.walletAddress,
		walletIntent: testState.walletIntent,
	}),
}));

describe("useExplicitAgentApproval", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	let approval: ExplicitAgentApproval | undefined;
	let Probe: (() => null) | undefined;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient();
		approval = undefined;
		Probe = undefined;
		testState.beforeSubmit = undefined;
		testState.connectedWalletAddress = OWNER;
		testState.embeddedWalletAddress = OWNER;
		testState.env = "Mainnet";
		testState.exchangeLifecycle.active = true;
		testState.hasWalletAccess = true;
		testState.walletAddress = OWNER;
		testState.walletClient = { account: { address: OWNER } };
		testState.walletIntent = "embedded";
		testState.clientApproveAgent.mockReset();
		testState.clientApproveAgent.mockResolvedValue({ status: "ok", response: { type: "default" } });
		testState.captureRegistrationLease.mockReset();
		testState.captureRegistrationLease.mockReturnValue({
			epoch: { env: "Mainnet", owner: OWNER, epoch: "11111111-1111-4111-8111-111111111111" },
		});
		testState.createExchangeClient.mockReset();
		testState.createExchangeClient.mockReturnValue({ approveAgent: testState.clientApproveAgent });
		testState.createExternalAgentSigner.mockReset();
		testState.createExternalAgentSigner.mockImplementation((options: { beforeSubmit: () => Promise<void> }) => {
			testState.beforeSubmit = options.beforeSubmit;
			return { getAddresses: vi.fn(), getChainId: vi.fn(), signTypedData: vi.fn() };
		});
		testState.createPrivyAgentSigner.mockReset();
		testState.createPrivyAgentSigner.mockImplementation((options: { beforeSubmit: () => Promise<void> }) => {
			testState.beforeSubmit = options.beforeSubmit;
			return { address: OWNER };
		});
		testState.enforceLegalActions = false;
		testState.hasSameWalletAddress = true;
		testState.isRegistrationLeaseCurrent.mockReset();
		testState.isRegistrationLeaseCurrent.mockResolvedValue(true);
		testState.startRegistrationExecution.mockReset();
		testState.startRegistrationExecution.mockImplementation(
			async (_lease: unknown, canStart: () => boolean, execute: () => Promise<unknown>) =>
				canStart() ? { status: "started", execution: execute() } : { status: "invalidated" },
		);
		testState.verifyLegalActionAllowed.mockReset();
		testState.verifyLegalActionAllowed.mockResolvedValue({});
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		vi.clearAllMocks();
	});

	async function renderApprovalHook() {
		const { useExplicitAgentApproval } = await import("@/hooks/wallet/use-explicit-agent-approval");
		if (!Probe) {
			Probe = () => {
				approval = useExplicitAgentApproval();
				return null;
			};
		}
		const CurrentProbe = Probe;
		act(() => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(CurrentProbe))));
		if (!approval) throw new Error("Approval hook did not render");
		return approval;
	}

	it("passes AbortSignal to the direct embedded-wallet SDK request", async () => {
		const hook = await renderApprovalHook();
		const controller = new AbortController();
		const params = { agentAddress: AGENT, agentName: "Mobile" };

		await act(async () => {
			await hook.mutateAsync(params, { signal: controller.signal });
		});

		expect(testState.clientApproveAgent).toHaveBeenCalledWith(params, { signal: controller.signal });
	});

	it("checks legal access before the direct embedded-wallet SDK request", async () => {
		testState.enforceLegalActions = true;
		const hook = await renderApprovalHook();
		const params = { agentAddress: AGENT, agentName: "Mobile" };

		await act(async () => {
			await hook.mutateAsync(params);
		});

		expect(testState.verifyLegalActionAllowed).toHaveBeenCalledWith(
			expect.objectContaining({ env: "Mainnet", owner: OWNER }),
		);
		expect(testState.verifyLegalActionAllowed.mock.invocationCallOrder[0]).toBeLessThan(
			testState.clientApproveAgent.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
		);
	});

	it("does not dispatch direct approval when legal access cannot be verified", async () => {
		testState.enforceLegalActions = true;
		testState.verifyLegalActionAllowed.mockRejectedValue(new Error("legal status unavailable"));
		const hook = await renderApprovalHook();

		await act(async () => {
			await expect(hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" })).rejects.toThrow(
				"legal status unavailable",
			);
		});

		expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
	});

	it("does not capture a lease or open the old signer after identity changes during legal preflight", async () => {
		const legal = createDeferred<unknown>();
		testState.enforceLegalActions = true;
		testState.verifyLegalActionAllowed.mockReturnValue(legal.promise);
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(testState.verifyLegalActionAllowed).toHaveBeenCalledOnce());
		});
		if (!request) throw new Error("Agent approval did not start");

		testState.walletAddress = OTHER_OWNER;
		testState.connectedWalletAddress = OTHER_OWNER;
		testState.embeddedWalletAddress = OTHER_OWNER;
		testState.env = "Testnet";
		await renderApprovalHook();
		legal.resolve({});

		await act(async () => {
			await expect(request).rejects.toThrow("The wallet session changed before mobile access approval.");
		});
		expect(testState.captureRegistrationLease).not.toHaveBeenCalled();
		expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
	});

	it("requires a force-fresh legal check after signing before direct submission", async () => {
		const signed = createDeferred<void>();
		testState.enforceLegalActions = true;
		testState.verifyLegalActionAllowed
			.mockResolvedValueOnce({})
			.mockRejectedValueOnce(new Error("Legal access changed after signing"));
		testState.clientApproveAgent.mockImplementation(async () => {
			await signed.promise;
			if (!testState.beforeSubmit) throw new Error("Missing pre-submit guard");
			await testState.beforeSubmit();
			return { status: "ok", response: { type: "default" } };
		});
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(testState.beforeSubmit).toBeTypeOf("function"));
		});
		if (!request) throw new Error("Agent approval did not start");
		signed.resolve();

		await act(async () => {
			await expect(request).rejects.toThrow("Legal access changed after signing");
		});
		expect(testState.verifyLegalActionAllowed).toHaveBeenCalledTimes(2);
		expect(testState.verifyLegalActionAllowed).toHaveBeenLastCalledWith(
			expect.objectContaining({ env: "Mainnet", owner: OWNER, forceFresh: true }),
		);
		expect(testState.isRegistrationLeaseCurrent).not.toHaveBeenCalled();
	});

	it("uses a guarded external-wallet signer and forwards AbortSignal to its SDK request", async () => {
		testState.walletIntent = "external";
		testState.embeddedWalletAddress = OTHER_OWNER;
		const hook = await renderApprovalHook();
		const controller = new AbortController();
		const params = { agentAddress: AGENT, agentName: "Mobile" };

		await act(async () => {
			await hook.mutateAsync(params, { signal: controller.signal });
		});

		expect(testState.createExternalAgentSigner).toHaveBeenCalledWith(
			expect.objectContaining({
				expectedAddress: OWNER,
				walletClient: testState.walletClient,
				beforeSubmit: expect.any(Function),
			}),
		);
		expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).toHaveBeenCalledWith(params, { signal: controller.signal });
	});

	it("requires a force-fresh legal check after external-wallet signing", async () => {
		const signed = createDeferred<void>();
		testState.walletIntent = "external";
		testState.embeddedWalletAddress = OTHER_OWNER;
		testState.enforceLegalActions = true;
		testState.verifyLegalActionAllowed
			.mockResolvedValueOnce({})
			.mockRejectedValueOnce(new Error("Legal access changed after external signing"));
		testState.clientApproveAgent.mockImplementation(async () => {
			await signed.promise;
			if (!testState.beforeSubmit) throw new Error("Missing external pre-submit guard");
			await testState.beforeSubmit();
			return { status: "ok", response: { type: "default" } };
		});
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(testState.beforeSubmit).toBeTypeOf("function"));
		});
		if (!request) throw new Error("External Agent approval did not start");
		signed.resolve();

		await act(async () => {
			await expect(request).rejects.toThrow("Legal access changed after external signing");
		});
		expect(testState.verifyLegalActionAllowed).toHaveBeenCalledTimes(2);
		expect(testState.verifyLegalActionAllowed).toHaveBeenLastCalledWith(
			expect.objectContaining({ env: "Mainnet", owner: OWNER, forceFresh: true }),
		);
		expect(testState.isRegistrationLeaseCurrent).not.toHaveBeenCalled();
	});

	it("rechecks the exact Privy, Wagmi, owner, and environment identity after external-wallet signing", async () => {
		const signed = createDeferred<void>();
		testState.walletIntent = "external";
		testState.embeddedWalletAddress = OTHER_OWNER;
		testState.clientApproveAgent.mockImplementation(async () => {
			await signed.promise;
			if (!testState.beforeSubmit) throw new Error("Missing external pre-submit guard");
			await testState.beforeSubmit();
			return { status: "ok", response: { type: "default" } };
		});
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(testState.beforeSubmit).toBeTypeOf("function"));
		});
		if (!request) throw new Error("External Agent approval did not start");

		testState.walletAddress = OTHER_OWNER;
		testState.connectedWalletAddress = OTHER_OWNER;
		testState.walletClient = { account: { address: OTHER_OWNER } };
		testState.env = "Testnet";
		await renderApprovalHook();
		signed.resolve();

		await act(async () => {
			await expect(request).rejects.toThrow("The wallet session changed before mobile access approval.");
		});
		expect(testState.isRegistrationLeaseCurrent).not.toHaveBeenCalled();
	});

	it("rechecks the exact registration lease after external-wallet signing", async () => {
		const signed = createDeferred<void>();
		testState.walletIntent = "external";
		testState.embeddedWalletAddress = OTHER_OWNER;
		testState.isRegistrationLeaseCurrent.mockResolvedValue(false);
		testState.clientApproveAgent.mockImplementation(async () => {
			await signed.promise;
			if (!testState.beforeSubmit) throw new Error("Missing external pre-submit guard");
			await testState.beforeSubmit();
			return { status: "ok", response: { type: "default" } };
		});
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(testState.beforeSubmit).toBeTypeOf("function"));
		});
		if (!request) throw new Error("External Agent approval did not start");
		signed.resolve();

		await act(async () => {
			await expect(request).rejects.toThrow("The wallet session changed before mobile access approval.");
		});
		expect(testState.isRegistrationLeaseCurrent).toHaveBeenCalledWith(
			expect.objectContaining({ epoch: expect.objectContaining({ env: "Mainnet", owner: OWNER }) }),
		);
	});

	it("does not create a signer or dispatch when already aborted", async () => {
		const hook = await renderApprovalHook();
		const controller = new AbortController();
		const params = { agentAddress: AGENT, agentName: "Mobile" };
		controller.abort();

		await expect(hook.mutateAsync(params, { signal: controller.signal })).rejects.toMatchObject({
			name: "AbortError",
		});

		expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
		expect(testState.signTypedData).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
	});

	it("does not create the external-wallet signer when already aborted", async () => {
		testState.walletIntent = "external";
		testState.embeddedWalletAddress = OTHER_OWNER;
		const hook = await renderApprovalHook();
		const controller = new AbortController();
		const params = { agentAddress: AGENT, agentName: "Mobile" };
		controller.abort();

		await expect(hook.mutateAsync(params, { signal: controller.signal })).rejects.toMatchObject({
			name: "AbortError",
		});

		expect(testState.createExternalAgentSigner).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
	});

	it("does not create a signer when the exact registration lease is no longer current", async () => {
		testState.startRegistrationExecution.mockResolvedValue({ status: "invalidated" });
		const hook = await renderApprovalHook();

		await act(async () => {
			await expect(hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" })).rejects.toThrow(
				"The wallet session changed before mobile access approval.",
			);
		});

		expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
		expect(testState.signTypedData).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
	});

	it("rejects the start guard when identity changes after lease capture", async () => {
		const start = createDeferred<{ status: "invalidated" }>();
		let canStart: (() => boolean) | undefined;
		testState.startRegistrationExecution.mockImplementation(async (_lease: unknown, currentCanStart: () => boolean) => {
			canStart = currentCanStart;
			return start.promise;
		});
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(canStart).toBeTypeOf("function"));
		});
		if (!request || !canStart) throw new Error("Agent approval did not reach its start guard");

		testState.walletAddress = OTHER_OWNER;
		testState.connectedWalletAddress = OTHER_OWNER;
		testState.embeddedWalletAddress = OTHER_OWNER;
		await renderApprovalHook();
		expect(canStart()).toBe(false);
		start.resolve({ status: "invalidated" });

		await act(async () => {
			await expect(request).rejects.toThrow("The wallet session changed before mobile access approval.");
		});
		expect(testState.createPrivyAgentSigner).not.toHaveBeenCalled();
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
	});

	it("rechecks the owner and environment after signing before direct approval submission", async () => {
		const signed = createDeferred<void>();
		testState.clientApproveAgent.mockImplementation(async () => {
			await signed.promise;
			if (!testState.beforeSubmit) throw new Error("Missing pre-submit guard");
			await testState.beforeSubmit();
			return { status: "ok", response: { type: "default" } };
		});
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(testState.beforeSubmit).toBeTypeOf("function"));
		});
		if (!request) throw new Error("Agent approval did not start");

		testState.walletAddress = OTHER_OWNER;
		testState.connectedWalletAddress = OTHER_OWNER;
		testState.embeddedWalletAddress = OTHER_OWNER;
		testState.env = "Testnet";
		await renderApprovalHook();
		signed.resolve();

		await act(async () => {
			await expect(request).rejects.toThrow("The wallet session changed before mobile access approval.");
		});
		expect(testState.isRegistrationLeaseCurrent).not.toHaveBeenCalled();
	});

	it("rechecks the exact registration lease after signing", async () => {
		const signed = createDeferred<void>();
		testState.isRegistrationLeaseCurrent.mockResolvedValue(false);
		testState.clientApproveAgent.mockImplementation(async () => {
			await signed.promise;
			if (!testState.beforeSubmit) throw new Error("Missing pre-submit guard");
			await testState.beforeSubmit();
			return { status: "ok", response: { type: "default" } };
		});
		const hook = await renderApprovalHook();
		let request: Promise<unknown> | undefined;

		await act(async () => {
			request = hook.mutateAsync({ agentAddress: AGENT, agentName: "Mobile" });
			await vi.waitFor(() => expect(testState.beforeSubmit).toBeTypeOf("function"));
		});
		if (!request) throw new Error("Agent approval did not start");
		signed.resolve();

		await act(async () => {
			await expect(request).rejects.toThrow("The wallet session changed before mobile access approval.");
		});
		expect(testState.isRegistrationLeaseCurrent).toHaveBeenCalledWith(
			expect.objectContaining({ epoch: expect.objectContaining({ env: "Mainnet", owner: OWNER }) }),
		);
	});
});
