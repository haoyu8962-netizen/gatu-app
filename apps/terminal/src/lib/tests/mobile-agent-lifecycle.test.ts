import type { AgentWallet } from "@sairn/hl-react";
import { getExchangeMethodConfig } from "@sairn/hl-react/registries/exchange";
import type { AgentWalletMetadata } from "@sairn/hl-react/signing/agent-storage";
import {
	createMobileAgentApproval,
	createMobileAgentStorageMetadata,
	createMobileAgentWalletRecord,
	getMobileAgentNameBase,
	MOBILE_AGENT_NAME_BASE,
	MOBILE_AGENT_VALIDITY_MS,
	shouldClearMobileAgent,
	verifyExpectedMobileAgent,
	verifyMobileAgent,
} from "@sairn/hl-react/signing/mobile-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveAgentRequirements, getDefinitiveMobileAgentStaleReason } from "@/lib/hyperliquid";

const NOW_MS = 1_779_364_227_000;
const USER_ADDRESS = "0x1111111111111111111111111111111111111111";
const OLD_PRIVATE_KEY = `0x${"11".repeat(32)}` as const;
const NEW_PRIVATE_KEY = `0x${"22".repeat(32)}` as const;

function installStorage() {
	const store = new Map<string, string>();
	const target = new EventTarget();
	const storage = {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: (key: string) => {
			store.delete(key);
		},
		clear: () => store.clear(),
	};
	const win = {
		addEventListener: target.addEventListener.bind(target),
		removeEventListener: target.removeEventListener.bind(target),
		dispatchEvent: target.dispatchEvent.bind(target),
	};
	vi.stubGlobal("window", win);
	vi.stubGlobal("localStorage", storage);
	vi.stubGlobal(
		"StorageEvent",
		class StorageEventShim extends Event {
			key: string | null;
			constructor(type: string, init: { key?: string | null } = {}) {
				super(type);
				this.key = init.key ?? null;
			}
		},
	);
	return store;
}

describe("mobile agent lifecycle", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("verifies a first linked mobile agent against extraAgents", () => {
		const approval = createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY);
		const localAgent = createMobileAgentWalletRecord({
			privateKey: approval.privateKey,
			publicKey: approval.publicKey,
			agentName: approval.agentName,
			agentValidUntilMs: approval.agentValidUntilMs,
			importedAtMs: NOW_MS,
		});
		const verification = verifyMobileAgent(
			localAgent,
			[{ address: approval.publicKey, name: MOBILE_AGENT_NAME_BASE, validUntil: approval.agentValidUntilMs }],
			NOW_MS,
		);

		expect(verification.status).toBe("approved");
		expect(shouldClearMobileAgent(verification)).toBe(false);
	});

	it("strictly verifies one expected Mobile named-Agent slot", () => {
		const approval = createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY);
		const verification = verifyExpectedMobileAgent(
			[{ address: approval.publicKey, name: MOBILE_AGENT_NAME_BASE, validUntil: approval.agentValidUntilMs }],
			{
				agentAddress: approval.publicKey,
				agentNameBase: MOBILE_AGENT_NAME_BASE,
				agentValidUntilMs: approval.agentValidUntilMs,
			},
			NOW_MS,
		);

		expect(verification).toMatchObject({
			status: "approved",
			remoteAgent: {
				address: approval.publicKey,
				name: MOBILE_AGENT_NAME_BASE,
				validUntil: approval.agentValidUntilMs,
			},
		});
	});

	it.each([
		{
			label: "an unavailable remote response",
			extraAgents: undefined,
			expectedStatus: "remote_unknown",
		},
		{
			label: "a missing named slot",
			extraAgents: [],
			expectedStatus: "missing",
		},
		{
			label: "multiple normalized Mobile named slots",
			extraAgents: [
				{
					address: createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY).publicKey,
					name: MOBILE_AGENT_NAME_BASE,
					validUntil: createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY).agentValidUntilMs,
				},
				{
					address: createMobileAgentApproval(NOW_MS, NEW_PRIVATE_KEY).publicKey,
					name: MOBILE_AGENT_NAME_BASE,
					validUntil: createMobileAgentApproval(NOW_MS + 1, NEW_PRIVATE_KEY).agentValidUntilMs,
				},
			],
			expectedStatus: "ambiguous",
		},
	])("rejects $label", ({ extraAgents, expectedStatus }) => {
		const approval = createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY);

		expect(
			verifyExpectedMobileAgent(
				extraAgents,
				{
					agentAddress: approval.publicKey,
					agentNameBase: MOBILE_AGENT_NAME_BASE,
					agentValidUntilMs: approval.agentValidUntilMs,
				},
				NOW_MS,
			),
		).toEqual({ status: expectedStatus });
	});

	it("rejects strict address, name, expiry, null-expiry, and expiration mismatches", () => {
		const approval = createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY);
		const replacement = createMobileAgentApproval(NOW_MS + 1, NEW_PRIVATE_KEY);
		const expected = {
			agentAddress: approval.publicKey,
			agentNameBase: MOBILE_AGENT_NAME_BASE,
			agentValidUntilMs: approval.agentValidUntilMs,
		};

		expect(
			verifyExpectedMobileAgent(
				[
					{
						address: replacement.publicKey,
						name: MOBILE_AGENT_NAME_BASE,
						validUntil: approval.agentValidUntilMs,
					},
				],
				expected,
				NOW_MS,
			),
		).toEqual({ status: "address_mismatch" });
		expect(
			verifyExpectedMobileAgent(
				[
					{
						address: approval.publicKey,
						name: "Other",
						validUntil: approval.agentValidUntilMs,
					},
				],
				expected,
				NOW_MS,
			),
		).toEqual({ status: "name_mismatch" });
		expect(
			verifyExpectedMobileAgent(
				[
					{
						address: approval.publicKey,
						name: `${MOBILE_AGENT_NAME_BASE} valid_until ${approval.agentValidUntilMs + 1}`,
						validUntil: approval.agentValidUntilMs,
					},
				],
				expected,
				NOW_MS,
			),
		).toEqual({ status: "name_mismatch" });
		expect(
			verifyExpectedMobileAgent(
				[
					{
						address: approval.publicKey,
						name: MOBILE_AGENT_NAME_BASE,
						validUntil: approval.agentValidUntilMs + 1,
					},
				],
				expected,
				NOW_MS,
			),
		).toEqual({ status: "expiry_mismatch" });
		expect(
			verifyExpectedMobileAgent(
				[{ address: approval.publicKey, name: MOBILE_AGENT_NAME_BASE, validUntil: null }],
				expected,
				NOW_MS,
			),
		).toEqual({ status: "expiry_mismatch" });
		expect(
			verifyExpectedMobileAgent(
				[
					{
						address: approval.publicKey,
						name: MOBILE_AGENT_NAME_BASE,
						validUntil: Number.MAX_SAFE_INTEGER + 1,
					},
				],
				expected,
				NOW_MS,
			),
		).toEqual({ status: "expiry_mismatch" });
		expect(
			verifyExpectedMobileAgent(
				[{ address: approval.publicKey, name: MOBILE_AGENT_NAME_BASE, validUntil: approval.agentValidUntilMs }],
				expected,
				approval.agentValidUntilMs,
			),
		).toEqual({ status: "expired" });
	});

	it("treats relinked older local mobile access as stale while preserving the named slot base", () => {
		const oldApproval = createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY);
		const newApproval = createMobileAgentApproval(NOW_MS + 1, NEW_PRIVATE_KEY);
		const oldLocalAgent = createMobileAgentWalletRecord({
			privateKey: oldApproval.privateKey,
			publicKey: oldApproval.publicKey,
			agentName: oldApproval.agentName,
			agentValidUntilMs: oldApproval.agentValidUntilMs,
			importedAtMs: NOW_MS,
		});
		const verification = verifyMobileAgent(
			oldLocalAgent,
			[{ address: newApproval.publicKey, name: MOBILE_AGENT_NAME_BASE, validUntil: newApproval.agentValidUntilMs }],
			NOW_MS + 1,
		);

		expect(getMobileAgentNameBase(oldApproval.agentName)).toBe(MOBILE_AGENT_NAME_BASE);
		expect(getMobileAgentNameBase(newApproval.agentName)).toBe(MOBILE_AGENT_NAME_BASE);
		expect(verification).toMatchObject({ status: "stale", reason: "missing_remote" });
		expect(shouldClearMobileAgent(verification)).toBe(true);
	});

	it("marks expired local mobile agents as stale before trusting remote state", () => {
		const approval = createMobileAgentApproval(NOW_MS - MOBILE_AGENT_VALIDITY_MS - 1, OLD_PRIVATE_KEY);
		const expiredLocalAgent = createMobileAgentWalletRecord({
			privateKey: approval.privateKey,
			publicKey: approval.publicKey,
			agentName: approval.agentName,
			agentValidUntilMs: approval.agentValidUntilMs,
			importedAtMs: NOW_MS - MOBILE_AGENT_VALIDITY_MS,
		});

		const verification = verifyMobileAgent(
			expiredLocalAgent,
			[{ address: approval.publicKey, name: MOBILE_AGENT_NAME_BASE, validUntil: approval.agentValidUntilMs }],
			NOW_MS,
		);

		expect(verification).toMatchObject({ status: "stale", reason: "expired_local" });
		expect(shouldClearMobileAgent(verification)).toBe(true);
	});

	it("persists mobile metadata and clears local storage on reset", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW_MS);
		installStorage();
		const approval = createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY);
		const metadata = createMobileAgentStorageMetadata({
			agentName: approval.agentName,
			agentValidUntilMs: approval.agentValidUntilMs,
			importedAtMs: NOW_MS,
		}) satisfies AgentWalletMetadata;
		const { readAgentFromStorage, removeAgentFromStorage, writeAgentToStorage } = await import(
			"@sairn/hl-react/signing/agent-storage"
		);

		writeAgentToStorage("Mainnet", USER_ADDRESS, approval.privateKey, approval.publicKey, metadata);
		expect(readAgentFromStorage("Mainnet", USER_ADDRESS)).toMatchObject({
			privateKey: approval.privateKey,
			publicKey: approval.publicKey,
			source: "mobile-sync",
			agentNameBase: MOBILE_AGENT_NAME_BASE,
			agentName: approval.agentName,
			agentValidUntilMs: approval.agentValidUntilMs,
			importedAtMs: NOW_MS,
		});

		removeAgentFromStorage("Mainnet", USER_ADDRESS);
		expect(readAgentFromStorage("Mainnet", USER_ADDRESS)).toBeNull();
		vi.useRealTimers();
	});

	it("only reports strict storage success after an exact readback", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW_MS);
		installStorage();
		const approval = createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY);
		const metadata = createMobileAgentStorageMetadata({
			agentName: approval.agentName,
			agentValidUntilMs: approval.agentValidUntilMs,
			importedAtMs: NOW_MS,
		}) satisfies AgentWalletMetadata;
		const { writeAgentToStorageAndVerify } = await import("@sairn/hl-react/signing/agent-storage");

		const result = writeAgentToStorageAndVerify(
			"Mainnet",
			USER_ADDRESS,
			approval.privateKey,
			approval.publicKey,
			metadata,
		);

		expect(result).toMatchObject({
			status: "stored",
			agent: {
				privateKey: approval.privateKey,
				publicKey: approval.publicKey,
			},
		});
	});

	it("fails closed when strict storage cannot write or read back", async () => {
		installStorage();
		const approval = createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY);
		const { writeAgentToStorageAndVerify } = await import("@sairn/hl-react/signing/agent-storage");

		vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
			throw new Error("quota");
		});
		expect(writeAgentToStorageAndVerify("Mainnet", USER_ADDRESS, approval.privateKey, approval.publicKey)).toEqual({
			status: "failed",
			reason: "write_failed",
		});

		// The verified writer first reads the previous Agent so it can evict
		// signer/client caches, then performs the security-sensitive readback.
		vi.spyOn(localStorage, "getItem").mockReturnValueOnce(null).mockReturnValueOnce(null);
		expect(writeAgentToStorageAndVerify("Mainnet", USER_ADDRESS, approval.privateKey, approval.publicKey)).toEqual({
			status: "failed",
			reason: "readback_mismatch",
		});

		expect(
			writeAgentToStorageAndVerify(
				"Mainnet",
				USER_ADDRESS,
				approval.privateKey,
				createMobileAgentApproval(NOW_MS, NEW_PRIVATE_KEY).publicKey,
			),
		).toEqual({
			status: "failed",
			reason: "invalid_agent",
		});
	});

	it("reports remote verification failures for expired or wrong-name agents", () => {
		const approval = createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY);
		const localAgent = createMobileAgentWalletRecord({
			privateKey: approval.privateKey,
			publicKey: approval.publicKey,
			agentName: approval.agentName,
			agentValidUntilMs: approval.agentValidUntilMs,
			importedAtMs: NOW_MS,
		});

		expect(
			verifyMobileAgent(
				localAgent,
				[{ address: approval.publicKey, name: MOBILE_AGENT_NAME_BASE, validUntil: NOW_MS - 1 }],
				NOW_MS,
			),
		).toMatchObject({ status: "stale", reason: "expired_remote" });

		expect(
			verifyMobileAgent(
				localAgent,
				[
					{
						address: approval.publicKey,
						name: "OtherAgent",
						validUntil: approval.agentValidUntilMs,
					},
				],
				NOW_MS,
			),
		).toMatchObject({ status: "stale", reason: "wrong_remote_name" });
	});

	it("wires strict mobile Agent verification into runtime trading readiness", () => {
		const approval = createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY);
		const localAgent = createMobileAgentWalletRecord({
			privateKey: approval.privateKey,
			publicKey: approval.publicKey,
			agentName: approval.agentName,
			agentValidUntilMs: approval.agentValidUntilMs,
			importedAtMs: NOW_MS,
		});

		const ready = deriveAgentRequirements(
			undefined,
			[{ address: approval.publicKey, name: MOBILE_AGENT_NAME_BASE, validUntil: approval.agentValidUntilMs }],
			localAgent,
			undefined,
			NOW_MS,
		);
		expect(ready).toMatchObject({ needsAgent: false, isReady: true });

		for (const remoteAgent of [
			{ address: approval.publicKey, name: MOBILE_AGENT_NAME_BASE, validUntil: null },
			{ address: approval.publicKey, name: "Other", validUntil: approval.agentValidUntilMs },
			{ address: approval.publicKey, name: MOBILE_AGENT_NAME_BASE, validUntil: approval.agentValidUntilMs + 1 },
		]) {
			expect(deriveAgentRequirements(undefined, [remoteAgent], localAgent, undefined, NOW_MS)).toMatchObject({
				needsAgent: true,
				isReady: false,
			});
		}
	});

	it.each([
		{
			label: "partial metadata",
			buildAgent: (approval: ReturnType<typeof createMobileAgentApproval>) => ({
				privateKey: approval.privateKey,
				publicKey: approval.publicKey,
				source: "mobile-sync" as const,
			}),
		},
		{
			label: "a non-canonical local name",
			buildAgent: (approval: ReturnType<typeof createMobileAgentApproval>) => ({
				privateKey: approval.privateKey,
				publicKey: approval.publicKey,
				source: "mobile-sync" as const,
				agentNameBase: MOBILE_AGENT_NAME_BASE,
				agentName: `${MOBILE_AGENT_NAME_BASE} valid_until ${approval.agentValidUntilMs + 1}`,
				agentValidUntilMs: approval.agentValidUntilMs,
				importedAtMs: NOW_MS,
			}),
		},
		{
			label: "a mismatched private and public key",
			buildAgent: (approval: ReturnType<typeof createMobileAgentApproval>) => ({
				privateKey: approval.privateKey,
				publicKey: createMobileAgentApproval(NOW_MS, NEW_PRIVATE_KEY).publicKey,
				source: "mobile-sync" as const,
				agentNameBase: MOBILE_AGENT_NAME_BASE,
				agentName: approval.agentName,
				agentValidUntilMs: approval.agentValidUntilMs,
				importedAtMs: NOW_MS,
			}),
		},
	])("fails closed for a mobile-sourced record with $label", ({ buildAgent }) => {
		const approval = createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY);
		const localAgent = buildAgent(approval) as AgentWallet;
		const remoteAgent = {
			address: localAgent.publicKey,
			name: MOBILE_AGENT_NAME_BASE,
			validUntil: approval.agentValidUntilMs,
		};

		expect(verifyMobileAgent(localAgent, [remoteAgent], NOW_MS)).toMatchObject({
			status: "stale",
			reason: "invalid_local",
		});
		expect(deriveAgentRequirements(undefined, [remoteAgent], localAgent, undefined, NOW_MS)).toMatchObject({
			needsAgent: true,
			isReady: false,
		});
	});

	it("keeps local-registration Agents on the generic address approval path", () => {
		const approval = createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY);
		const localAgent: AgentWallet = {
			privateKey: approval.privateKey,
			publicKey: approval.publicKey,
			source: "local-registration",
		};
		const remoteAgent = {
			address: approval.publicKey,
			name: "app",
			validUntil: null,
		};

		expect(verifyMobileAgent(localAgent, [remoteAgent], NOW_MS)).toMatchObject({
			status: "not_mobile_agent",
		});
		expect(deriveAgentRequirements(undefined, [remoteAgent], localAgent, undefined, NOW_MS)).toMatchObject({
			needsAgent: false,
			isReady: true,
		});
	});

	it("only reconciles local mobile credentials from a fresh, definitive remote result", () => {
		const approval = createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY);
		const localAgent = createMobileAgentWalletRecord({
			privateKey: approval.privateKey,
			publicKey: approval.publicKey,
			agentName: approval.agentName,
			agentValidUntilMs: approval.agentValidUntilMs,
			importedAtMs: NOW_MS,
		});
		const freshOptions = {
			requestSucceeded: true,
			isFetching: false,
			dataUpdatedAt: NOW_MS + 1,
			nowMs: NOW_MS,
		};

		expect(
			getDefinitiveMobileAgentStaleReason(localAgent, undefined, {
				...freshOptions,
				requestSucceeded: false,
			}),
		).toBeNull();
		expect(
			getDefinitiveMobileAgentStaleReason(localAgent, [], {
				...freshOptions,
				isFetching: true,
			}),
		).toBeNull();
		expect(
			getDefinitiveMobileAgentStaleReason(localAgent, [], {
				...freshOptions,
				dataUpdatedAt: NOW_MS,
			}),
		).toBeNull();
		expect(getDefinitiveMobileAgentStaleReason(localAgent, [], freshOptions)).toBe("missing_remote");
		expect(
			getDefinitiveMobileAgentStaleReason(
				localAgent,
				[{ address: approval.publicKey, name: MOBILE_AGENT_NAME_BASE, validUntil: null }],
				freshOptions,
			),
		).toBe("remote_expiry_mismatch");
	});

	it("reconciles an expired local mobile credential without waiting for a remote response", () => {
		const approval = createMobileAgentApproval(NOW_MS - MOBILE_AGENT_VALIDITY_MS - 1, OLD_PRIVATE_KEY);
		const localAgent = createMobileAgentWalletRecord({
			privateKey: approval.privateKey,
			publicKey: approval.publicKey,
			agentName: approval.agentName,
			agentValidUntilMs: approval.agentValidUntilMs,
			importedAtMs: NOW_MS - MOBILE_AGENT_VALIDITY_MS,
		});

		expect(
			getDefinitiveMobileAgentStaleReason(localAgent, undefined, {
				requestSucceeded: false,
				isFetching: true,
				dataUpdatedAt: 0,
				nowMs: NOW_MS,
			}),
		).toBe("expired_local");
	});

	it("keeps sensitive account actions on the user-wallet signing path", () => {
		expect(getExchangeMethodConfig("approveAgent").client).toBe("user");
		expect(getExchangeMethodConfig("approveBuilderFee").client).toBe("user");
		expect(getExchangeMethodConfig("withdraw3").client).toBe("user");
		expect(getExchangeMethodConfig("usdSend").client).toBe("user");
		expect(getExchangeMethodConfig("stakingLinkDisableTradingUser").client).toBe("user");
		expect(getExchangeMethodConfig("order").client).toBe("trading");
		expect(getExchangeMethodConfig("cancel").client).toBe("trading");
	});
});
