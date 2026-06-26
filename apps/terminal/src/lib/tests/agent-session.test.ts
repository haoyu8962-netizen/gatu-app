// @vitest-environment jsdom
import {
	type AgentOwner,
	clearActiveAgentOwner,
	getActiveAgentOwner,
	resolveSession,
	setActiveAgentOwner,
} from "@gatu/hl-react";
import { beforeEach, describe, expect, it } from "vitest";

const WALLET = "0x1111111111111111111111111111111111111111" as const;
const OWNER = "0x2222222222222222222222222222222222222222" as const;
const STORAGE_KEY = "hyperliquid_active_agent_owner";

describe("resolveSession", () => {
	it("uses the connected wallet when present (wallet mode, zero regression)", () => {
		expect(resolveSession(WALLET, null, "Mainnet")).toEqual({ clientKey: WALLET, sessionMode: "wallet" });
	});

	it("connected wallet always wins, even if an agent-only owner exists", () => {
		const agentOwner: AgentOwner = { env: "Mainnet", address: OWNER };
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
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({ env: "Testnet", address: OWNER });
	});

	it("clears the active owner and removes the stored key", () => {
		setActiveAgentOwner("Testnet", OWNER);
		clearActiveAgentOwner();
		expect(getActiveAgentOwner()).toBeNull();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("rejects malformed and zero addresses", () => {
		setActiveAgentOwner("Mainnet", "0xnot-an-address" as `0x${string}`);
		expect(getActiveAgentOwner()).toBeNull();
		setActiveAgentOwner("Mainnet", "0x0000000000000000000000000000000000000000");
		expect(getActiveAgentOwner()).toBeNull();
	});
});
