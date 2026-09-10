// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_BUILDER_CONFIG = { b: "0x0" as `0x${string}`, f: 0 };
const ADDRESS_A = "0x1234567890abcdef1234567890abcdef12345678" as const;
const ADDRESS_A_CASE_VARIANT = "0x1234567890ABCDEF1234567890ABCDEF12345678" as const;
const ADDRESS_B = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;

const sessionMocks = vi.hoisted(() => ({
	activate: vi.fn<() => Promise<boolean>>(),
	closeAndRemove: vi.fn(),
}));
const schedulerMocks = vi.hoisted(() => ({
	invalidateIdentity: vi.fn(),
	invalidateLifecycle: vi.fn(),
}));
const storeMocks = vi.hoisted(() => ({
	create: vi.fn(),
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
		createHyperliquidStore: (...args: unknown[]) => {
			storeMocks.create(...args);
			return createStore(() => ({ config: {} }));
		},
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
		storeMocks.create.mockReset();
	});

	it("allows transport consumers without a signing session", async () => {
		const { HyperliquidTransportProvider, useHyperliquidOptional, useHyperliquidStoreApi, useHyperliquidTransport } =
			await import("@gatu/hl-react/provider");

		let capturedEnv: string | undefined;
		let hasStore = false;
		let optionalContext: ReturnType<typeof useHyperliquidOptional> | undefined;
		function Consumer() {
			capturedEnv = useHyperliquidTransport().env;
			hasStore = Boolean(useHyperliquidStoreApi());
			optionalContext = useHyperliquidOptional();
			return null;
		}

		const container = document.createElement("div");
		const root = createRoot(container);
		act(() => {
			root.render(
				<HyperliquidTransportProvider env="Testnet">
					<Consumer />
				</HyperliquidTransportProvider>,
			);
		});

		expect(capturedEnv).toBe("Testnet");
		expect(hasStore).toBe(true);
		expect(optionalContext).toBeNull();
		expect(storeMocks.create).toHaveBeenCalledOnce();
		await act(async () => {
			root.unmount();
			await Promise.resolve();
		});
	});

	it("throws when a transport consumer has no transport provider", async () => {
		const { useHyperliquidTransport } = await import("@gatu/hl-react/provider");
		function Consumer() {
			useHyperliquidTransport();
			return null;
		}

		const container = document.createElement("div");
		const root = createRoot(container);
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			expect(() => {
				act(() => root.render(<Consumer />));
			}).toThrow(/useHyperliquidTransport/);
		} finally {
			consoleError.mockRestore();
			act(() => root.unmount());
		}
	});

	it("composes transport and session contexts around one store", async () => {
		const { HyperliquidProvider, useHyperliquid, useHyperliquidStoreApi, useHyperliquidTransport } = await import(
			"@gatu/hl-react/provider"
		);
		const stores = new Set<unknown>();
		let contextsShareTransport = false;
		let capturesLegalEnforcement = false;
		function Consumer() {
			const transport = useHyperliquidTransport();
			const combined = useHyperliquid();
			stores.add(useHyperliquidStoreApi());
			contextsShareTransport = combined.info === transport.info && combined.subscription === transport.subscription;
			capturesLegalEnforcement = combined.enforceLegalActions;
			return null;
		}

		const container = document.createElement("div");
		const root = createRoot(container);
		await act(async () => {
			root.render(
				<HyperliquidProvider
					env="Testnet"
					userAddress={ADDRESS_A}
					builderConfig={TEST_BUILDER_CONFIG}
					enforceLegalActions
				>
					<Consumer />
				</HyperliquidProvider>,
			);
			await Promise.resolve();
		});
		await act(async () => {
			root.render(
				<HyperliquidProvider
					env="Testnet"
					userAddress={ADDRESS_B}
					builderConfig={TEST_BUILDER_CONFIG}
					enforceLegalActions
				>
					<Consumer />
				</HyperliquidProvider>,
			);
			await Promise.resolve();
		});

		expect(contextsShareTransport).toBe(true);
		expect(capturesLegalEnforcement).toBe(true);
		expect(stores.size).toBe(1);
		expect(storeMocks.create).toHaveBeenCalledOnce();
		await act(async () => {
			root.unmount();
			await Promise.resolve();
		});
	});

	it("preserves the full context reference across consumer-only rerenders", async () => {
		const { HyperliquidProvider, useHyperliquid, useHyperliquidOptional } = await import("@gatu/hl-react/provider");
		const requiredContexts: ReturnType<typeof useHyperliquid>[] = [];
		const optionalContexts: ReturnType<typeof useHyperliquidOptional>[] = [];
		let rerenderConsumer = () => {};
		function Consumer() {
			const [, setRevision] = useState(0);
			rerenderConsumer = () => setRevision((revision) => revision + 1);
			requiredContexts.push(useHyperliquid());
			optionalContexts.push(useHyperliquidOptional());
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
		act(() => rerenderConsumer());

		expect(requiredContexts).toHaveLength(2);
		expect(requiredContexts[1]).toBe(requiredContexts[0]);
		expect(optionalContexts[0]).toBe(requiredContexts[0]);
		expect(optionalContexts[1]).toBe(requiredContexts[0]);
		await act(async () => {
			root.unmount();
			await Promise.resolve();
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

	it("does not fall back to an agent-only owner while wallet restoration is unresolved", async () => {
		const { clearActiveAgentOwner, setActiveAgentOwnerAndVerify } = await import(
			"@gatu/hl-react/signing/agent-session"
		);
		const { HyperliquidProvider, useHyperliquid } = await import("@gatu/hl-react/provider");
		clearActiveAgentOwner();
		expect(setActiveAgentOwnerAndVerify("Testnet", ADDRESS_B)).toBe(true);
		let capturedKey: string | undefined;
		let capturedMode: string | undefined;
		function Consumer() {
			const context = useHyperliquid();
			capturedKey = context.clientKey;
			capturedMode = context.sessionMode;
			return null;
		}
		const container = document.createElement("div");
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<HyperliquidProvider
					env="Testnet"
					userAddress={undefined}
					allowAgentOnlySession={false}
					builderConfig={TEST_BUILDER_CONFIG}
				>
					<Consumer />
				</HyperliquidProvider>,
			);
		});

		expect(capturedKey).toBe("disconnected");
		expect(capturedMode).toBe("disconnected");
		await act(async () => {
			root.unmount();
			await Promise.resolve();
		});
		clearActiveAgentOwner();
	});

	it("keeps the exact Agent while a wallet signer is transiently unavailable", async () => {
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

		expect(sessionMocks.closeAndRemove).not.toHaveBeenCalled();
		expect(schedulerMocks.invalidateIdentity).toHaveBeenCalledWith("Testnet", ADDRESS_A, "wallet");
		await act(async () => {
			root.unmount();
			await Promise.resolve();
		});
	});

	it("restores the same wallet after a transient disconnect without deleting its Agent", async () => {
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
		await act(async () => {
			root.render(
				<HyperliquidProvider env="Testnet" userAddress={ADDRESS_A} builderConfig={TEST_BUILDER_CONFIG}>
					<div />
				</HyperliquidProvider>,
			);
		});

		expect(sessionMocks.closeAndRemove).not.toHaveBeenCalled();
		expect(sessionMocks.activate).toHaveBeenLastCalledWith("Testnet", ADDRESS_A);
		await act(async () => {
			root.unmount();
			await Promise.resolve();
		});
	});

	it("cleans account A when a transient disconnect resolves to account B", async () => {
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
		await act(async () => {
			root.render(
				<HyperliquidProvider env="Testnet" userAddress={ADDRESS_B} builderConfig={TEST_BUILDER_CONFIG}>
					<div />
				</HyperliquidProvider>,
			);
		});

		expect(sessionMocks.closeAndRemove).toHaveBeenCalledOnce();
		expect(sessionMocks.closeAndRemove).toHaveBeenCalledWith("Testnet", ADDRESS_A, {
			preserveIfSubmissionStarted: true,
			restoreOnFailure: false,
		});
		expect(sessionMocks.activate).toHaveBeenLastCalledWith("Testnet", ADDRESS_B);
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
			preserveIfSubmissionStarted: true,
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
					userAddress={ADDRESS_B}
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

	async function createSessionProbe() {
		const { HyperliquidProvider, useHyperliquid } = await import("@gatu/hl-react/provider");
		let currentLease: ReturnType<typeof useHyperliquid>["exchangeSession"] | undefined;
		function Consumer() {
			currentLease = useHyperliquid().exchangeSession;
			return null;
		}
		const root = createRoot(document.createElement("div"));
		return {
			async render(userAddress: `0x${string}` | undefined, env: "Mainnet" | "Testnet" = "Testnet") {
				await act(async () => {
					root.render(
						<HyperliquidProvider env={env} userAddress={userAddress} builderConfig={TEST_BUILDER_CONFIG}>
							<Consumer />
						</HyperliquidProvider>,
					);
				});
				expect(currentLease).toBeDefined();
				return currentLease;
			},
			async unmount() {
				await act(async () => root.unmount());
			},
		};
	}

	it("issues one active exchange-session lease per committed signing identity", async () => {
		const probe = await createSessionProbe();
		let latestLease: Awaited<ReturnType<typeof probe.render>>;
		try {
			const originalA = await probe.render(ADDRESS_A);
			expect(originalA?.active).toBe(true);
			expect(await probe.render(ADDRESS_A_CASE_VARIANT)).toBe(originalA);
			const leaseB = await probe.render(ADDRESS_B);
			latestLease = await probe.render(ADDRESS_A);

			expect(originalA).not.toBe(leaseB);
			expect(latestLease).not.toBe(originalA);
			expect(originalA?.active).toBe(false);
			expect(leaseB?.active).toBe(false);
			expect(latestLease?.active).toBe(true);
			expect(latestLease?.clientKey).toBe(ADDRESS_A.toLowerCase());
		} finally {
			await probe.unmount();
		}
		expect(latestLease?.active).toBe(false);
	});

	it("does not revive a signing lease after a transient disconnect", async () => {
		const probe = await createSessionProbe();
		try {
			const connectedLease = await probe.render(ADDRESS_A);
			const disconnectedLease = await probe.render(undefined);
			const restoredLease = await probe.render(ADDRESS_A_CASE_VARIANT);

			expect(connectedLease).not.toBe(disconnectedLease);
			expect(restoredLease).not.toBe(connectedLease);
			expect(connectedLease?.active).toBe(false);
			expect(disconnectedLease?.active).toBe(false);
			expect(restoredLease?.active).toBe(true);
			expect(sessionMocks.closeAndRemove).not.toHaveBeenCalled();
		} finally {
			await probe.unmount();
		}
	});

	it("invalidates the session lease across a network round trip", async () => {
		const probe = await createSessionProbe();
		try {
			const originalLease = await probe.render(ADDRESS_A, "Mainnet");
			const testnetLease = await probe.render(ADDRESS_A, "Testnet");
			const restoredLease = await probe.render(ADDRESS_A, "Mainnet");

			expect(originalLease?.env).toBe("Mainnet");
			expect(testnetLease?.env).toBe("Testnet");
			expect(originalLease?.active).toBe(false);
			expect(testnetLease?.active).toBe(false);
			expect(restoredLease).not.toBe(originalLease);
			expect(restoredLease?.active).toBe(true);
		} finally {
			await probe.unmount();
		}
	});

	it("invalidates the lease when the same owner changes between wallet and agent-only signing", async () => {
		const { clearActiveAgentOwner, setActiveAgentOwnerAndVerify } = await import(
			"@gatu/hl-react/signing/agent-session"
		);
		clearActiveAgentOwner();
		expect(setActiveAgentOwnerAndVerify("Testnet", ADDRESS_A)).toBe(true);
		const probe = await createSessionProbe();
		try {
			const walletLease = await probe.render(ADDRESS_A);
			const agentLease = await probe.render(undefined);
			const restoredLease = await probe.render(ADDRESS_A);

			expect(walletLease?.sessionMode).toBe("wallet");
			expect(agentLease?.sessionMode).toBe("agent-only");
			expect(agentLease?.clientKey).toBe(walletLease?.clientKey);
			expect(walletLease?.active).toBe(false);
			expect(agentLease?.active).toBe(false);
			expect(restoredLease).not.toBe(walletLease);
			expect(restoredLease?.active).toBe(true);
		} finally {
			await probe.unmount();
			clearActiveAgentOwner();
		}
	});
});
