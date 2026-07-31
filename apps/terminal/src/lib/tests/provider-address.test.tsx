// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_BUILDER_CONFIG = { b: "0x0" as `0x${string}`, f: 0 };
const ADDRESS_A = "0x1234567890abcdef1234567890abcdef12345678" as const;
const ADDRESS_B = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;

const sessionMocks = vi.hoisted(() => ({
	activate: vi.fn<() => Promise<boolean>>(),
	closeAndRemove: vi.fn(),
}));
const schedulerMocks = vi.hoisted(() => ({
	invalidateIdentity: vi.fn(),
	invalidateLifecycle: vi.fn(),
}));

vi.mock("@gatu/hl-react/internal/websocket/chaos", () => ({
	registerChaosHarness: vi.fn(),
}));
vi.mock("@gatu/hl-react/internal/websocket/debug", () => ({
	registerDebugSnapshot: vi.fn(),
	setDebugStore: vi.fn(),
}));
vi.mock("@gatu/hl-react/internal/exchange/request-scheduler", () => ({
	invalidateExchangeProviderLifecycle: schedulerMocks.invalidateLifecycle,
	invalidateExchangeRequestIdentity: schedulerMocks.invalidateIdentity,
}));
vi.mock("@gatu/hl-react/clients", () => ({
	createWsReconnectTrigger: () => () => {},
	getHttpTransport: () => ({}),
	getInfoClient: () => ({}),
	getSubscriptionClient: () => ({}),
	getWsTransport: () => ({}),
	initializeClients: vi.fn(),
}));
vi.mock("@gatu/hl-react/create-config", () => ({
	createHyperliquidConfig: () => ({
		httpTransport: {},
		wsTransport: {},
		ssr: false,
	}),
}));
vi.mock("@gatu/hl-react/store", async () => {
	const { createStore } = await vi.importActual<typeof import("zustand")>("zustand");
	return {
		createHyperliquidStore: () => createStore(() => ({ config: {} })),
	};
});
vi.mock("@gatu/hl-react/signing/agent-registration-session", () => ({
	activateAgentRegistrationSession: sessionMocks.activate,
	closeAgentRegistrationSessionAndRemove: sessionMocks.closeAndRemove,
}));

describe("HyperliquidProvider userAddress prop", () => {
	beforeEach(() => {
		schedulerMocks.invalidateIdentity.mockReset();
		schedulerMocks.invalidateLifecycle.mockReset();
		sessionMocks.activate.mockReset();
		sessionMocks.activate.mockResolvedValue(true);
		sessionMocks.closeAndRemove.mockReset();
		sessionMocks.closeAndRemove.mockResolvedValue({
			status: "closed",
			epoch: { env: "Testnet", owner: ADDRESS_A, epoch: "cleanup-epoch" },
		});
	});

	it("sets clientKey to 'disconnected' when userAddress is undefined", async () => {
		const { HyperliquidProvider, useHyperliquid } = await import("@gatu/hl-react/provider");

		let capturedKey: string | undefined;
		function Consumer() {
			const ctx = useHyperliquid();
			capturedKey = ctx.clientKey;
			return null;
		}

		const container = document.createElement("div");
		const root = createRoot(container);
		act(() => {
			root.render(
				<HyperliquidProvider env="Testnet" userAddress={undefined} builderConfig={TEST_BUILDER_CONFIG}>
					<Consumer />
				</HyperliquidProvider>,
			);
		});

		expect(capturedKey).toBe("disconnected");
		await act(async () => {
			root.unmount();
			await Promise.resolve();
		});
	});

	it("sets clientKey to address when userAddress is provided", async () => {
		const { HyperliquidProvider, useHyperliquid } = await import("@gatu/hl-react/provider");

		let capturedKey: string | undefined;
		function Consumer() {
			const ctx = useHyperliquid();
			capturedKey = ctx.clientKey;
			return null;
		}

		const container = document.createElement("div");
		const root = createRoot(container);
		act(() => {
			root.render(
				<HyperliquidProvider env="Testnet" userAddress={ADDRESS_A} builderConfig={TEST_BUILDER_CONFIG}>
					<Consumer />
				</HyperliquidProvider>,
			);
		});

		expect(capturedKey).toBe(ADDRESS_A);
		await act(async () => {
			root.unmount();
			await Promise.resolve();
		});
	});

	it("removes the exact Agent when a wallet disconnects outside the logout button", async () => {
		const { HyperliquidProvider } = await import("@gatu/hl-react/provider");
		const container = document.createElement("div");
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<HyperliquidProvider env="Testnet" userAddress={ADDRESS_A} builderConfig={TEST_BUILDER_CONFIG}>
					<div />
				</HyperliquidProvider>,
			);
		});
		await act(async () => {
			root.render(
				<HyperliquidProvider env="Testnet" userAddress={undefined} builderConfig={TEST_BUILDER_CONFIG}>
					<div />
				</HyperliquidProvider>,
			);
		});

		expect(sessionMocks.closeAndRemove).toHaveBeenCalledWith("Testnet", ADDRESS_A, {
			restoreOnFailure: false,
		});
		expect(schedulerMocks.invalidateIdentity).toHaveBeenCalledWith("Testnet", ADDRESS_A, "wallet");
		await act(async () => {
			root.unmount();
			await Promise.resolve();
		});
	});

	it("removes account A before retiring its lifecycle when the wallet switches to B", async () => {
		const { HyperliquidProvider } = await import("@gatu/hl-react/provider");
		const container = document.createElement("div");
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<HyperliquidProvider env="Testnet" userAddress={ADDRESS_A} builderConfig={TEST_BUILDER_CONFIG}>
					<div />
				</HyperliquidProvider>,
			);
		});
		await act(async () => {
			root.render(
				<HyperliquidProvider env="Testnet" userAddress={ADDRESS_B} builderConfig={TEST_BUILDER_CONFIG}>
					<div />
				</HyperliquidProvider>,
			);
		});

		expect(sessionMocks.closeAndRemove).toHaveBeenCalledWith("Testnet", ADDRESS_A, {
			restoreOnFailure: false,
		});
		expect(sessionMocks.activate).toHaveBeenLastCalledWith("Testnet", ADDRESS_B);
		expect(schedulerMocks.invalidateIdentity).toHaveBeenCalledWith("Testnet", ADDRESS_A, "wallet");
		await act(async () => {
			root.unmount();
			await Promise.resolve();
		});
	});

	it("surfaces verified cleanup failure while leaving lifecycle cleanup fail-closed", async () => {
		const { HyperliquidProvider } = await import("@gatu/hl-react/provider");
		const onCleanupFailure = vi.fn();
		sessionMocks.closeAndRemove.mockResolvedValue({ status: "failed", reason: "remove_failed" });
		const container = document.createElement("div");
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<HyperliquidProvider
					env="Testnet"
					userAddress={ADDRESS_A}
					builderConfig={TEST_BUILDER_CONFIG}
					onAgentCleanupFailure={onCleanupFailure}
				>
					<div />
				</HyperliquidProvider>,
			);
		});
		await act(async () => {
			root.render(
				<HyperliquidProvider
					env="Testnet"
					userAddress={undefined}
					builderConfig={TEST_BUILDER_CONFIG}
					onAgentCleanupFailure={onCleanupFailure}
				>
					<div />
				</HyperliquidProvider>,
			);
			await Promise.resolve();
		});

		expect(onCleanupFailure).toHaveBeenCalledWith({
			env: "Testnet",
			owner: ADDRESS_A,
			reason: "remove_failed",
		});
		await act(async () => {
			root.unmount();
			await Promise.resolve();
		});
	});

	it("marks the lifecycle inactive and invalidates it after a real Provider unmount", async () => {
		const { HyperliquidProvider, useHyperliquid } = await import("@gatu/hl-react/provider");
		let lifecycle: ReturnType<typeof useHyperliquid>["exchangeLifecycle"] | undefined;
		function Consumer() {
			lifecycle = useHyperliquid().exchangeLifecycle;
			return null;
		}

		const container = document.createElement("div");
		const root = createRoot(container);
		await act(async () => {
			root.render(
				<HyperliquidProvider env="Testnet" userAddress={ADDRESS_A} builderConfig={TEST_BUILDER_CONFIG}>
					<Consumer />
				</HyperliquidProvider>,
			);
		});
		expect(lifecycle?.active).toBe(true);

		await act(async () => {
			root.unmount();
			await Promise.resolve();
		});

		expect(lifecycle?.active).toBe(false);
		expect(schedulerMocks.invalidateLifecycle).toHaveBeenCalledWith(lifecycle);
	});
});
