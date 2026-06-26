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

describe("active agent owner store", () => {
	beforeEach(() => clearActiveAgentOwner());

	it("sets and reads the active owner (lowercased)", () => {
		setActiveAgentOwner("Mainnet", OWNER.toUpperCase().replace("0X", "0x") as `0x${string}`);
		expect(getActiveAgentOwner()).toEqual({ env: "Mainnet", address: OWNER });
	});

	it("clears the active owner", () => {
		setActiveAgentOwner("Testnet", OWNER);
		clearActiveAgentOwner();
		expect(getActiveAgentOwner()).toBeNull();
	});

	it("rejects malformed addresses", () => {
		setActiveAgentOwner("Mainnet", "0xnot-an-address" as `0x${string}`);
		expect(getActiveAgentOwner()).toBeNull();
	});
});
