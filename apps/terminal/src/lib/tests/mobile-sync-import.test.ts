import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { MobileSyncImportError, verifyImportedMobileAgent } from "../mobile-sync/import-verification";
import { createMobileAgentSyncUrl, decryptMobileAgentSyncEnvelope, MobileSyncError } from "../mobile-sync/sync-core";

const NOW_MS = 1_779_364_227_000;
const APP_ORIGIN = "https://app.hypeterminal.com";
const USER_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const OTHER_USER_ADDRESS = "0x2222222222222222222222222222222222222222" as const;
const AGENT_PRIVATE_KEY = `0x${"ab".repeat(32)}` as const;

async function createImportedFixture() {
	const sync = await createMobileAgentSyncUrl({
		appOrigin: APP_ORIGIN,
		env: "Mainnet",
		userAddress: USER_ADDRESS,
		agentPrivateKey: AGENT_PRIVATE_KEY,
		nowMs: NOW_MS,
	});
	const imported = await decryptMobileAgentSyncEnvelope(sync.envelope, sync.pairingCode, {
		currentOrigin: APP_ORIGIN,
		expectedEnv: "Mainnet",
		expectedUserAddress: USER_ADDRESS,
		nowMs: NOW_MS,
	});

	return { sync, imported };
}

describe("mobile sync import verification", () => {
	it("turns a decrypted and remotely approved import into a storage-ready agent wallet", async () => {
		const { sync, imported } = await createImportedFixture();
		const verifiedAgent = verifyImportedMobileAgent({
			imported,
			extraAgents: [{ address: sync.agentAddress, name: sync.agentName, validUntil: sync.agentValidUntilMs }],
			expectedEnv: "Mainnet",
			expectedUserAddress: USER_ADDRESS,
			nowMs: NOW_MS,
		});

		expect(verifiedAgent).toMatchObject({
			privateKey: AGENT_PRIVATE_KEY,
			publicKey: privateKeyToAccount(AGENT_PRIVATE_KEY).address.toLowerCase(),
			source: "mobile-sync",
			agentName: sync.agentName,
			agentValidUntilMs: sync.agentValidUntilMs,
			syncId: sync.syncId,
		});
	});

	it("rejects imports for the wrong connected account", async () => {
		const { sync, imported } = await createImportedFixture();

		expect(() =>
			verifyImportedMobileAgent({
				imported,
				extraAgents: [{ address: sync.agentAddress, name: sync.agentName, validUntil: sync.agentValidUntilMs }],
				expectedEnv: "Mainnet",
				expectedUserAddress: OTHER_USER_ADDRESS,
				nowMs: NOW_MS,
			}),
		).toThrow(MobileSyncError);
	});

	it("requires a connected owner account before storage", async () => {
		const { sync, imported } = await createImportedFixture();

		expect(() =>
			verifyImportedMobileAgent({
				imported,
				extraAgents: [{ address: sync.agentAddress, name: sync.agentName, validUntil: sync.agentValidUntilMs }],
				expectedEnv: "Mainnet",
				expectedUserAddress: undefined as never,
				nowMs: NOW_MS,
			}),
		).toThrow(MobileSyncError);
	});

	it("rejects mobile agents that are missing from remote approvals", async () => {
		const { imported } = await createImportedFixture();

		expect(() =>
			verifyImportedMobileAgent({
				imported,
				extraAgents: [],
				expectedEnv: "Mainnet",
				expectedUserAddress: USER_ADDRESS,
				nowMs: NOW_MS,
			}),
		).toThrow(MobileSyncImportError);
	});

	it("rejects remote approvals that do not match the exact imported mobile agent name and expiry", async () => {
		const { sync, imported } = await createImportedFixture();

		expect(() =>
			verifyImportedMobileAgent({
				imported,
				extraAgents: [
					{
						address: sync.agentAddress,
						name: `${sync.agentName} stale`,
						validUntil: sync.agentValidUntilMs,
					},
				],
				expectedEnv: "Mainnet",
				expectedUserAddress: USER_ADDRESS,
				nowMs: NOW_MS,
			}),
		).toThrow(MobileSyncImportError);
	});
});
