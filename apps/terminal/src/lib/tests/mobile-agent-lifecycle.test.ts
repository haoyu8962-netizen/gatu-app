import { getExchangeMethodConfig } from "@hypeterminal/hl-react/registries/exchange";
import type { AgentWalletMetadata } from "@hypeterminal/hl-react/signing/agent-storage";
import {
	createMobileAgentApproval,
	createMobileAgentRevocationApproval,
	createMobileAgentStorageMetadata,
	createMobileAgentWalletRecord,
	getMobileAgentNameBase,
	MOBILE_AGENT_NAME_BASE,
	MOBILE_AGENT_REVOKE_VALIDITY_MS,
	MOBILE_AGENT_VALIDITY_MS,
	shouldClearMobileAgent,
	verifyMobileAgent,
} from "@hypeterminal/hl-react/signing/mobile-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

const NOW_MS = 1_779_364_227_000;
const USER_ADDRESS = "0x1111111111111111111111111111111111111111";
const OLD_PRIVATE_KEY = `0x${"11".repeat(32)}` as const;
const NEW_PRIVATE_KEY = `0x${"22".repeat(32)}` as const;
const REVOKE_PRIVATE_KEY = `0x${"33".repeat(32)}` as const;

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
			syncId: "first-link",
		});
		const verification = verifyMobileAgent(
			localAgent,
			[{ address: approval.publicKey, name: approval.agentName, validUntil: approval.agentValidUntilMs }],
			NOW_MS,
		);

		expect(verification.status).toBe("approved");
		expect(shouldClearMobileAgent(verification)).toBe(false);
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
			syncId: "old-link",
		});
		const verification = verifyMobileAgent(
			oldLocalAgent,
			[{ address: newApproval.publicKey, name: newApproval.agentName, validUntil: newApproval.agentValidUntilMs }],
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
			syncId: "expired-local",
		});

		const verification = verifyMobileAgent(
			expiredLocalAgent,
			[{ address: approval.publicKey, name: approval.agentName, validUntil: approval.agentValidUntilMs }],
			NOW_MS,
		);

		expect(verification).toMatchObject({ status: "stale", reason: "expired_local" });
		expect(shouldClearMobileAgent(verification)).toBe(true);
	});

	it("persists mobile metadata and clears local storage on reset", async () => {
		installStorage();
		const approval = createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY);
		const metadata = createMobileAgentStorageMetadata({
			agentName: approval.agentName,
			agentValidUntilMs: approval.agentValidUntilMs,
			importedAtMs: NOW_MS,
			syncId: "storage-reset",
		}) satisfies AgentWalletMetadata;
		const { readAgentFromStorage, removeAgentFromStorage, writeAgentToStorage } = await import(
			"@hypeterminal/hl-react/signing/agent-storage"
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
			syncId: "storage-reset",
		});

		removeAgentFromStorage("Mainnet", USER_ADDRESS);
		expect(readAgentFromStorage("Mainnet", USER_ADDRESS)).toBeNull();
	});

	it("reports remote verification failures for expired or wrong-name agents", () => {
		const approval = createMobileAgentApproval(NOW_MS, OLD_PRIVATE_KEY);
		const localAgent = createMobileAgentWalletRecord({
			privateKey: approval.privateKey,
			publicKey: approval.publicKey,
			agentName: approval.agentName,
			agentValidUntilMs: approval.agentValidUntilMs,
			importedAtMs: NOW_MS,
			syncId: "verification-failure",
		});

		expect(
			verifyMobileAgent(
				localAgent,
				[{ address: approval.publicKey, name: approval.agentName, validUntil: NOW_MS - 1 }],
				NOW_MS,
			),
		).toMatchObject({ status: "stale", reason: "expired_remote" });

		expect(
			verifyMobileAgent(
				localAgent,
				[
					{
						address: approval.publicKey,
						name: "OtherAgent valid_until 1780000000000",
						validUntil: approval.agentValidUntilMs,
					},
				],
				NOW_MS,
			),
		).toMatchObject({ status: "stale", reason: "wrong_remote_name" });
	});

	it("creates a throwaway short-lived approval for main-wallet revocation", () => {
		const revoke = createMobileAgentRevocationApproval(NOW_MS, REVOKE_PRIVATE_KEY);

		expect(revoke.privateKey).toBe(REVOKE_PRIVATE_KEY);
		expect(revoke.agentNameBase).toBe(MOBILE_AGENT_NAME_BASE);
		expect(revoke.agentValidUntilMs).toBe(NOW_MS + MOBILE_AGENT_REVOKE_VALIDITY_MS);
		expect(revoke.agentName).toBe(`${MOBILE_AGENT_NAME_BASE} valid_until ${revoke.agentValidUntilMs}`);
	});

	it("keeps sensitive account actions on the user-wallet signing path", () => {
		expect(getExchangeMethodConfig("approveAgent").client).toBe("user");
		expect(getExchangeMethodConfig("approveBuilderFee").client).toBe("user");
		expect(getExchangeMethodConfig("withdraw3").client).toBe("user");
		expect(getExchangeMethodConfig("usdSend").client).toBe("user");
		expect(getExchangeMethodConfig("order").client).toBe("trading");
		expect(getExchangeMethodConfig("cancel").client).toBe("trading");
	});
});
