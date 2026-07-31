// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExplicitAgentApproval } from "@/hooks/wallet/use-explicit-agent-approval";

const OWNER = "0x1111111111111111111111111111111111111111";
const AGENT = "0x2222222222222222222222222222222222222222";

const testState = vi.hoisted(() => ({
	clientApproveAgent: vi.fn(),
	captureRegistrationLease: vi.fn(),
	createExchangeClient: vi.fn(),
	createPrivyAgentSigner: vi.fn(),
	fallbackApproveAgent: vi.fn(),
	hasSameWalletAddress: true,
	signTypedData: vi.fn(),
	startRegistrationExecution: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
	useSignTypedData: () => ({ signTypedData: testState.signTypedData }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	captureAgentRegistrationExecutionLease: testState.captureRegistrationLease,
	createExchangeClient: testState.createExchangeClient,
	startAgentRegistrationExecution: testState.startRegistrationExecution,
	useExchange: () => ({
		isPending: false,
		mutateAsync: testState.fallbackApproveAgent,
	}),
	useHyperliquid: () => ({
		env: "Mainnet",
		exchangeLifecycle: { id: Symbol.for("test-provider"), active: true },
	}),
}));

vi.mock("@/lib/wallet/privy-agent-signer", () => ({
	createPrivyAgentSigner: testState.createPrivyAgentSigner,
}));

vi.mock("@/lib/wallet/privy-wagmi", () => ({
	hasSameWalletAddress: () => testState.hasSameWalletAddress,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		connectedWalletAddress: OWNER,
		embeddedWalletAddress: OWNER,
		hasWalletAccess: true,
		walletAddress: OWNER,
	}),
}));

describe("useExplicitAgentApproval", () => {
	let container: HTMLDivElement;
	let root: Root;
	let approval: ExplicitAgentApproval | undefined;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		approval = undefined;
		testState.clientApproveAgent.mockReset();
		testState.clientApproveAgent.mockResolvedValue({ status: "ok", response: { type: "default" } });
		testState.captureRegistrationLease.mockReset();
		testState.captureRegistrationLease.mockReturnValue({
			epoch: { env: "Mainnet", owner: OWNER, epoch: "11111111-1111-4111-8111-111111111111" },
		});
		testState.createExchangeClient.mockReset();
		testState.createExchangeClient.mockReturnValue({ approveAgent: testState.clientApproveAgent });
		testState.createPrivyAgentSigner.mockReset();
		testState.createPrivyAgentSigner.mockReturnValue({ address: OWNER });
		testState.fallbackApproveAgent.mockReset();
		testState.fallbackApproveAgent.mockResolvedValue({ status: "ok", response: { type: "default" } });
		testState.hasSameWalletAddress = true;
		testState.startRegistrationExecution.mockReset();
		testState.startRegistrationExecution.mockImplementation(
			async (_lease: unknown, canStart: () => boolean, execute: () => Promise<unknown>) =>
				canStart() ? { status: "started", execution: execute() } : { status: "invalidated" },
		);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	async function renderApprovalHook() {
		const { useExplicitAgentApproval } = await import("@/hooks/wallet/use-explicit-agent-approval");
		function Probe() {
			approval = useExplicitAgentApproval();
			return null;
		}
		act(() => root.render(createElement(Probe)));
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
		expect(testState.fallbackApproveAgent).not.toHaveBeenCalled();
	});

	it("keeps the fallback mutation signature unchanged when AbortSignal is provided", async () => {
		testState.hasSameWalletAddress = false;
		const hook = await renderApprovalHook();
		const controller = new AbortController();
		const params = { agentAddress: AGENT, agentName: "Mobile" };

		await act(async () => {
			await hook.mutateAsync(params, { signal: controller.signal });
		});

		expect(testState.fallbackApproveAgent).toHaveBeenCalledWith(params);
		expect(testState.clientApproveAgent).not.toHaveBeenCalled();
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
		expect(testState.fallbackApproveAgent).not.toHaveBeenCalled();
	});

	it("does not dispatch the external-wallet fallback when already aborted", async () => {
		testState.hasSameWalletAddress = false;
		const hook = await renderApprovalHook();
		const controller = new AbortController();
		const params = { agentAddress: AGENT, agentName: "Mobile" };
		controller.abort();

		await expect(hook.mutateAsync(params, { signal: controller.signal })).rejects.toMatchObject({
			name: "AbortError",
		});

		expect(testState.fallbackApproveAgent).not.toHaveBeenCalled();
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
});
