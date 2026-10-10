// @vitest-environment jsdom
import {
	type AgentOwner,
	clearActiveAgentOwner,
	clearActiveAgentOwnerIfMatches,
	getActiveAgentOwner,
	resolveSession,
	setActiveAgentOwner,
	setActiveAgentOwnerAndVerify,
	useActiveAgentOwner,
} from "@sairn/hl-react";
import {
	captureExchangeRequestGeneration,
	ExchangeRequestInvalidatedError,
	ExchangeRequestScheduler,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const WALLET = "0x1111111111111111111111111111111111111111" as const;
const OWNER = "0x2222222222222222222222222222222222222222" as const;
const STORAGE_KEY = "hyperliquid_active_agent_owner";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function ActiveOwnerSubscriber() {
	useActiveAgentOwner();
	return null;
}

describe("resolveSession", () => {
	it("uses the connected wallet when present (wallet mode, zero regression)", () => {
		expect(resolveSession(WALLET, null, "Mainnet")).toEqual({ clientKey: WALLET, sessionMode: "wallet" });
	});

	it("lets an imported agent-only owner win over a connected wallet, as on the official terminal", () => {
		const agentOwner: AgentOwner = { env: "Mainnet", address: OWNER };
		expect(resolveSession(WALLET, agentOwner, "Mainnet")).toEqual({ clientKey: OWNER, sessionMode: "agent-only" });
	});

	it("keeps the connected wallet when the agent-only owner belongs to another env", () => {
		const agentOwner: AgentOwner = { env: "Testnet", address: OWNER };
		expect(resolveSession(WALLET, agentOwner, "Mainnet")).toEqual({ clientKey: WALLET, sessionMode: "wallet" });
	});

	it("falls back to the agent-only owner when no wallet is connected", () => {
		const agentOwner: AgentOwner = { env: "Mainnet", address: OWNER };
		expect(resolveSession(undefined, agentOwner, "Mainnet")).toEqual({ clientKey: OWNER, sessionMode: "agent-only" });
	});

	it("ignores an agent-only owner from a different env", () => {
		const agentOwner: AgentOwner = { env: "Testnet", address: OWNER };
		expect(resolveSession(undefined, agentOwner, "Mainnet")).toEqual({
			clientKey: "disconnected",
			sessionMode: "disconnected",
		});
	});

	it("is disconnected with neither wallet nor agent owner", () => {
		expect(resolveSession(undefined, null, "Mainnet")).toEqual({
			clientKey: "disconnected",
			sessionMode: "disconnected",
		});
	});
});

describe("active agent owner store (jsdom + localStorage)", () => {
	beforeEach(() => {
		clearActiveAgentOwner();
		localStorage.clear();
	});

	it("sets and reads the active owner (lowercased)", () => {
		setActiveAgentOwner("Mainnet", OWNER.toUpperCase().replace("0X", "0x") as `0x${string}`);
		expect(getActiveAgentOwner()).toEqual({ env: "Mainnet", address: OWNER });
	});

	it("persists to localStorage so it survives a reload", () => {
		setActiveAgentOwner("Testnet", OWNER);
		const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Record<string, unknown>;
		expect(persisted).toMatchObject({ version: 1, env: "Testnet", address: OWNER });
		expect(persisted.activationEpoch).toEqual(expect.any(String));
	});

	it("only reports verified activation after exact storage readback", () => {
		expect(setActiveAgentOwnerAndVerify("Mainnet", OWNER)).toBe(true);
		expect(getActiveAgentOwner()).toEqual({ env: "Mainnet", address: OWNER });

		clearActiveAgentOwner();
		vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
			throw new Error("storage unavailable");
		});
		expect(setActiveAgentOwnerAndVerify("Mainnet", OWNER)).toBe(false);
		expect(getActiveAgentOwner()).toBeNull();
	});

	it("does not trust a cached owner when verified persistence fails", () => {
		setActiveAgentOwner("Mainnet", OWNER);
		expect(getActiveAgentOwner()).toEqual({ env: "Mainnet", address: OWNER });
		localStorage.removeItem(STORAGE_KEY);
		vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
			throw new Error("storage unavailable");
		});

		expect(setActiveAgentOwnerAndVerify("Mainnet", OWNER)).toBe(false);
	});

	it("keeps an exactly persisted owner authoritative when event dispatch is unavailable", () => {
		vi.spyOn(window, "dispatchEvent").mockImplementationOnce(() => {
			throw new Error("restricted webview");
		});

		expect(setActiveAgentOwnerAndVerify("Mainnet", OWNER)).toBe(true);
		expect(getActiveAgentOwner()).toEqual({ env: "Mainnet", address: OWNER });
		const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Record<string, unknown>;
		expect(persisted).toMatchObject({
			version: 1,
			env: "Mainnet",
			address: OWNER,
		});
		expect(persisted.activationEpoch).toEqual(expect.any(String));
	});

	it("clears the active owner and removes the stored key", () => {
		setActiveAgentOwner("Testnet", OWNER);
		clearActiveAgentOwner();
		expect(getActiveAgentOwner()).toBeNull();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("only clears the active owner when both environment and address match", () => {
		setActiveAgentOwner("Mainnet", OWNER);

		expect(clearActiveAgentOwnerIfMatches("Testnet", OWNER)).toBe(false);
		expect(clearActiveAgentOwnerIfMatches("Mainnet", WALLET)).toBe(false);
		expect(getActiveAgentOwner()).toEqual({ env: "Mainnet", address: OWNER });

		expect(clearActiveAgentOwnerIfMatches("Mainnet", OWNER)).toBe(true);
		expect(getActiveAgentOwner()).toBeNull();
	});

	it("blocks a stale agent-only session when persistent owner cleanup fails, then allows retry", () => {
		setActiveAgentOwner("Mainnet", OWNER);
		const removeSpy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
			throw new Error("remove unavailable");
		});
		const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("fallback unavailable");
		});

		expect(clearActiveAgentOwnerIfMatches("Mainnet", OWNER)).toBe(false);
		expect(getActiveAgentOwner()).toBeNull();
		const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Record<string, unknown>;
		expect(persisted).toMatchObject({
			version: 1,
			env: "Mainnet",
			address: OWNER,
		});
		expect(persisted.activationEpoch).toEqual(expect.any(String));

		removeSpy.mockRestore();
		setSpy.mockRestore();
		expect(clearActiveAgentOwnerIfMatches("Mainnet", OWNER)).toBe(true);
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("invalidates queued Agent work immediately on a cross-tab owner replacement", async () => {
		setActiveAgentOwner("Mainnet", OWNER);
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		act(() => root.render(createElement(ActiveOwnerSubscriber)));

		const scheduler = new ExchangeRequestScheduler();
		const generation = captureExchangeRequestGeneration("Mainnet", OWNER, "agent-only");
		let releaseStarted: (() => void) | undefined;
		const startedGate = new Promise<void>((resolve) => {
			releaseStarted = resolve;
		});
		const startedRun = vi.fn(async () => {
			await startedGate;
			return "started";
		});
		const queuedRun = vi.fn(async () => "queued");

		try {
			const started = scheduler.schedule("normal", startedRun, generation);
			await vi.waitFor(() => expect(startedRun).toHaveBeenCalledOnce());
			const queued = scheduler.schedule("normal", queuedRun, generation);
			const queuedRejection = expect(queued).rejects.toBeInstanceOf(ExchangeRequestInvalidatedError);

			const oldValue = JSON.stringify({ env: "Mainnet", address: OWNER });
			const newValue = JSON.stringify({ env: "Mainnet", address: WALLET });
			localStorage.setItem(STORAGE_KEY, newValue);
			act(() => {
				window.dispatchEvent(
					new StorageEvent("storage", {
						key: STORAGE_KEY,
						newValue,
						oldValue,
					}),
				);
			});

			await queuedRejection;
			expect(queuedRun).not.toHaveBeenCalled();
			expect(getActiveAgentOwner()).toEqual({ env: "Mainnet", address: WALLET });

			releaseStarted?.();
			await expect(started).resolves.toBe("started");
		} finally {
			releaseStarted?.();
			act(() => root.unmount());
			container.remove();
		}
	});

	it("rejects malformed and zero addresses", () => {
		setActiveAgentOwner("Mainnet", "0xnot-an-address" as `0x${string}`);
		expect(getActiveAgentOwner()).toBeNull();
		setActiveAgentOwner("Mainnet", "0x0000000000000000000000000000000000000000");
		expect(getActiveAgentOwner()).toBeNull();
	});
});
