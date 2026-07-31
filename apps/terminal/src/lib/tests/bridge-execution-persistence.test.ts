import type { RouteExtended } from "@lifi/sdk";
import { beforeEach, describe, expect, it } from "vitest";
import {
	BRIDGE_EXECUTION_MAX_SERIALIZED_CHARACTERS,
	BRIDGE_EXECUTION_RECOVERY_TTL_MS,
	BRIDGE_EXECUTION_STORAGE_KEY,
	getBridgeRouteIdentity,
	hasSameBridgeRouteIdentity,
	loadPersistedBridgeExecution,
	persistCommittedBridgeExecution,
	prepareCommittedBridgeRouteForTracking,
} from "@/lib/lifi/bridge-execution-persistence";

const SOURCE_ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";
const HYPERCORE_USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const TX_HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NOW = 10_000_000;

class MemoryStorage implements Storage {
	private readonly values = new Map<string, string>();

	get length() {
		return this.values.size;
	}

	clear() {
		this.values.clear();
	}

	getItem(key: string) {
		return this.values.get(key) ?? null;
	}

	key(index: number) {
		return [...this.values.keys()][index] ?? null;
	}

	removeItem(key: string) {
		this.values.delete(key);
	}

	setItem(key: string, value: string) {
		this.values.set(key, value);
	}
}

function createCommittedRoute(): RouteExtended {
	return {
		id: "route-1",
		fromChainId: 42161,
		fromAmount: "1000000",
		fromAmountUSD: "1",
		fromAddress: SOURCE_ADDRESS,
		fromToken: { address: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", chainId: 42161 },
		toChainId: 1337,
		toAmount: "997500",
		toAmountMin: "992512",
		toAmountUSD: "0.9965",
		toAddress: SOURCE_ADDRESS,
		toToken: { address: HYPERCORE_USDC_ADDRESS, chainId: 1337 },
		steps: [
			{
				id: "route-1",
				type: "lifi",
				tool: "hyperliquid",
				action: {
					fromAddress: SOURCE_ADDRESS,
					fromChainId: 42161,
					fromAmount: "1000000",
					fromToken: {
						address: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
						chainId: 42161,
					},
					toAddress: SOURCE_ADDRESS,
					toChainId: 1337,
					toToken: { address: HYPERCORE_USDC_ADDRESS, chainId: 1337 },
				},
				transactionRequest: { data: "0xprivate-calldata" },
				typedData: [{ signature: "0xsigned-message" }],
				execution: {
					status: "PENDING",
					startedAt: NOW - 1_000,
					process: [
						{
							type: "CROSS_CHAIN",
							status: "PENDING",
							chainId: 42161,
							txHash: TX_HASH,
							startedAt: NOW - 1_000,
							message: "wallet-specific error",
							signedTypedData: [{ signature: "0xsecret-signature" }],
						},
					],
				},
			},
		],
	} as unknown as RouteExtended;
}

describe("LI.FI bridge execution persistence", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	it("stores only a bounded, sanitized committed route and restores it for the exact wallet", () => {
		expect(
			persistCommittedBridgeExecution(
				{ route: createCommittedRoute(), expectedToAmount: "997500", startTime: NOW - 2_000 },
				storage,
				NOW,
			),
		).toBe(true);

		const serialized = storage.getItem(BRIDGE_EXECUTION_STORAGE_KEY);
		expect(serialized).not.toBeNull();
		expect(serialized).not.toContain("private-calldata");
		expect(serialized).not.toContain("signed-message");
		expect(serialized).not.toContain("secret-signature");
		expect(serialized).not.toContain("wallet-specific error");
		expect(loadPersistedBridgeExecution(OTHER_ADDRESS, storage, NOW)).toBeNull();
		expect(storage.getItem(BRIDGE_EXECUTION_STORAGE_KEY)).not.toBeNull();

		const caseVariantAddress = `0x${SOURCE_ADDRESS.slice(2).toUpperCase()}`;
		const restored = loadPersistedBridgeExecution(caseVariantAddress, storage, NOW);
		expect(restored).toMatchObject({
			expectedToAmount: "997500",
			startTime: NOW - 2_000,
			identity: {
				routeId: "route-1",
				stepId: "route-1",
				tool: "hyperliquid",
				sourceChainId: 42161,
				sourceAmount: "1000000",
				destinationChainId: 1337,
			},
		});
		expect(restored?.route.steps[0]?.transactionRequest).toBeUndefined();
		expect(restored?.route.steps[0]?.typedData).toBeUndefined();
		expect(restored?.route.steps[0]?.execution?.process[0]?.signedTypedData).toBeUndefined();
	});

	it("restores the previous envelope version during a same-tab deployment refresh", () => {
		expect(
			persistCommittedBridgeExecution(
				{ route: createCommittedRoute(), expectedToAmount: "997500", startTime: NOW - 2_000 },
				storage,
				NOW,
			),
		).toBe(true);
		const parsed = JSON.parse(storage.getItem(BRIDGE_EXECUTION_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
		parsed.version = 1;
		delete parsed.routeIdentity;
		storage.setItem(BRIDGE_EXECUTION_STORAGE_KEY, JSON.stringify(parsed));

		expect(loadPersistedBridgeExecution(SOURCE_ADDRESS, storage, NOW)).toMatchObject({
			identity: { routeId: "route-1", sourceChainId: 42161 },
		});
	});

	it("rejects uncommitted routes and never persists allowance-only progress", () => {
		const route = createCommittedRoute();
		const step = route.steps[0];
		if (!step?.execution) throw new Error("Missing execution");
		step.execution.process = [
			{
				type: "TOKEN_ALLOWANCE",
				status: "DONE",
				chainId: 42161,
				txHash: TX_HASH,
				startedAt: NOW - 1_000,
			},
		];

		expect(
			persistCommittedBridgeExecution({ route, expectedToAmount: "997500", startTime: NOW - 2_000 }, storage, NOW),
		).toBe(false);
		expect(storage.getItem(BRIDGE_EXECUTION_STORAGE_KEY)).toBeNull();
	});

	it("rejects duplicate source processes that could make the SDK select an uncommitted process", () => {
		const route = createCommittedRoute();
		const step = route.steps[0];
		if (!step?.execution) throw new Error("Missing execution");
		step.execution.process.unshift({
			type: "CROSS_CHAIN",
			status: "STARTED",
			chainId: 42161,
			startedAt: NOW - 1_000,
		});

		expect(
			persistCommittedBridgeExecution({ route, expectedToAmount: "997500", startTime: NOW - 2_000 }, storage, NOW),
		).toBe(false);
		expect(storage.getItem(BRIDGE_EXECUTION_STORAGE_KEY)).toBeNull();
	});

	it("keeps a committed source transaction recoverable when a later destination process failed", () => {
		const route = createCommittedRoute();
		const step = route.steps[0];
		if (!step?.execution) throw new Error("Missing execution");
		step.execution.status = "FAILED";
		step.execution.process.push({
			type: "RECEIVING_CHAIN",
			status: "FAILED",
			chainId: 1337,
			startedAt: NOW,
		});

		expect(
			persistCommittedBridgeExecution({ route, expectedToAmount: "997500", startTime: NOW - 2_000 }, storage, NOW),
		).toBe(true);
		expect(loadPersistedBridgeExecution(SOURCE_ADDRESS, storage, NOW)?.route).toMatchObject({
			steps: [{ execution: { status: "FAILED" } }],
		});
	});

	it("persists a failed source process with broadcast evidence and prepares a tracking-only route", () => {
		const route = createCommittedRoute();
		const step = route.steps[0];
		if (!step?.execution) throw new Error("Missing execution");
		step.execution.status = "FAILED";
		step.execution.process[0] = {
			...step.execution.process[0],
			status: "FAILED",
			doneAt: NOW,
		};

		expect(
			persistCommittedBridgeExecution({ route, expectedToAmount: "997500", startTime: NOW - 2_000 }, storage, NOW),
		).toBe(true);
		const restored = loadPersistedBridgeExecution(SOURCE_ADDRESS, storage, NOW);
		expect(restored?.route.steps[0]?.execution).toMatchObject({
			status: "FAILED",
			process: [expect.objectContaining({ status: "FAILED", txHash: TX_HASH })],
		});

		const trackingRoute = restored ? prepareCommittedBridgeRouteForTracking(restored.route) : null;
		expect(trackingRoute).not.toBe(restored?.route);
		expect(trackingRoute?.steps[0]?.transactionRequest).toBeUndefined();
		expect(trackingRoute?.steps[0]?.execution).toMatchObject({
			status: "PENDING",
			process: [expect.objectContaining({ status: "PENDING", txHash: TX_HASH })],
		});
	});

	it("treats an existing task id as committed recovery evidence", () => {
		const route = createCommittedRoute();
		const step = route.steps[0];
		const process = step?.execution?.process[0];
		if (!step?.execution || !process) throw new Error("Missing execution");
		step.execution.status = "FAILED";
		process.status = "FAILED";
		process.txHash = undefined;
		process.taskId = TX_HASH;

		expect(
			persistCommittedBridgeExecution({ route, expectedToAmount: "997500", startTime: NOW - 2_000 }, storage, NOW),
		).toBe(true);
		const trackingRoute = prepareCommittedBridgeRouteForTracking(route);
		expect(trackingRoute?.steps[0]?.execution?.process[0]).toMatchObject({
			status: "PENDING",
			taskId: TX_HASH,
		});
	});

	it("compares the full approved route fingerprint rather than only wallet and chain", () => {
		const approved = getBridgeRouteIdentity(createCommittedRoute());
		const changedRoute = createCommittedRoute();
		const step = changedRoute.steps[0];
		if (!step) throw new Error("Missing step");
		step.tool = "different-tool";
		const changed = getBridgeRouteIdentity(changedRoute);

		expect(approved).not.toBeNull();
		expect(changed).not.toBeNull();
		expect(hasSameBridgeRouteIdentity(approved, changed)).toBe(false);
	});

	it("rejects and clears expired or product-invariant-breaking records", () => {
		expect(
			persistCommittedBridgeExecution(
				{ route: createCommittedRoute(), expectedToAmount: "997500", startTime: NOW - 2_000 },
				storage,
				NOW,
			),
		).toBe(true);
		expect(
			loadPersistedBridgeExecution(SOURCE_ADDRESS, storage, NOW + BRIDGE_EXECUTION_RECOVERY_TTL_MS + 1),
		).toBeNull();
		expect(storage.getItem(BRIDGE_EXECUTION_STORAGE_KEY)).toBeNull();

		expect(
			persistCommittedBridgeExecution(
				{ route: createCommittedRoute(), expectedToAmount: "997500", startTime: NOW - 2_000 },
				storage,
				NOW,
			),
		).toBe(true);
		const parsed = JSON.parse(storage.getItem(BRIDGE_EXECUTION_STORAGE_KEY) ?? "{}") as {
			route: { toChainId: number };
		};
		parsed.route.toChainId = 1;
		storage.setItem(BRIDGE_EXECUTION_STORAGE_KEY, JSON.stringify(parsed));

		expect(loadPersistedBridgeExecution(SOURCE_ADDRESS, storage, NOW)).toBeNull();
		expect(storage.getItem(BRIDGE_EXECUTION_STORAGE_KEY)).toBeNull();

		expect(
			persistCommittedBridgeExecution(
				{ route: createCommittedRoute(), expectedToAmount: "997500", startTime: NOW - 2_000 },
				storage,
				NOW,
			),
		).toBe(true);
		const changedFingerprint = JSON.parse(storage.getItem(BRIDGE_EXECUTION_STORAGE_KEY) ?? "{}") as {
			route: { id: string; steps: Array<{ id: string }> };
		};
		changedFingerprint.route.id = "route-2";
		const changedStep = changedFingerprint.route.steps[0];
		if (!changedStep) throw new Error("Missing persisted route step");
		changedStep.id = "route-2";
		storage.setItem(BRIDGE_EXECUTION_STORAGE_KEY, JSON.stringify(changedFingerprint));

		expect(loadPersistedBridgeExecution(SOURCE_ADDRESS, storage, NOW)).toBeNull();
		expect(storage.getItem(BRIDGE_EXECUTION_STORAGE_KEY)).toBeNull();
	});

	it("rejects oversized and non-exact envelope schemas", () => {
		storage.setItem(BRIDGE_EXECUTION_STORAGE_KEY, "x".repeat(BRIDGE_EXECUTION_MAX_SERIALIZED_CHARACTERS + 1));
		expect(loadPersistedBridgeExecution(SOURCE_ADDRESS, storage, NOW)).toBeNull();
		expect(storage.getItem(BRIDGE_EXECUTION_STORAGE_KEY)).toBeNull();

		expect(
			persistCommittedBridgeExecution(
				{ route: createCommittedRoute(), expectedToAmount: "997500", startTime: NOW - 2_000 },
				storage,
				NOW,
			),
		).toBe(true);
		const parsed = JSON.parse(storage.getItem(BRIDGE_EXECUTION_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
		parsed.unexpected = true;
		storage.setItem(BRIDGE_EXECUTION_STORAGE_KEY, JSON.stringify(parsed));

		expect(loadPersistedBridgeExecution(SOURCE_ADDRESS, storage, NOW)).toBeNull();
		expect(storage.getItem(BRIDGE_EXECUTION_STORAGE_KEY)).toBeNull();
	});
});
