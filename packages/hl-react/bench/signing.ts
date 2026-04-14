/**
 * Benchmark: EIP-712 signing latency — before vs. after FastHyperliquidSigner
 *
 * Run from repo root:
 *   pnpm --filter @hypeterminal/hl-react exec tsx bench/signing.ts
 */

import { privateKeyToAccount } from "viem/accounts";
import { createL1AgentWallet } from "../src/signing/l1-agent-wallet";

// Anvil test key — safe to embed in a benchmark
const TEST_PRIVATE_KEY =
	"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// Simulates what the SDK's createL1ActionHash produces for any order
const MOCK_CONNECTION_ID =
	"0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3" as const;

const account = privateKeyToAccount(TEST_PRIVATE_KEY);
const fastSigner = createL1AgentWallet(account);

// ─── The two signing approaches ───────────────────────────────────────────────

// BEFORE: exactly what the SDK's signL1Action passes to your wallet on every order.
// viem recomputes domain separator, EIP712Domain type hash, Agent type hash,
// and source string hash on every call.
async function signBefore() {
	return account.signTypedData({
		domain: {
			name: "Exchange",
			version: "1",
			chainId: 1337,
			verifyingContract: ZERO_ADDRESS,
		},
		types: {
			EIP712Domain: [
				{ name: "name", type: "string" },
				{ name: "version", type: "string" },
				{ name: "chainId", type: "uint256" },
				{ name: "verifyingContract", type: "address" },
			],
			Agent: [
				{ name: "source", type: "string" },
				{ name: "connectionId", type: "bytes32" },
			],
		},
		primaryType: "Agent",
		message: { source: "a", connectionId: MOCK_CONNECTION_ID },
	});
}

// AFTER: FastHyperliquidSigner intercepts the same call and uses pre-computed
// constants — only structHash + digest need computing per order.
async function signAfter() {
	return fastSigner.signTypedData({
		domain: {
			name: "Exchange",
			version: "1",
			chainId: 1337,
			verifyingContract: ZERO_ADDRESS,
		},
		types: {
			EIP712Domain: [
				{ name: "name", type: "string" },
				{ name: "version", type: "string" },
				{ name: "chainId", type: "uint256" },
				{ name: "verifyingContract", type: "address" },
			],
			Agent: [
				{ name: "source", type: "string" },
				{ name: "connectionId", type: "bytes32" },
			],
		},
		primaryType: "Agent",
		message: { source: "a", connectionId: MOCK_CONNECTION_ID },
	});
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
	const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
	return sorted[idx];
}

function stats(times: number[]) {
	const sorted = [...times].sort((a, b) => a - b);
	const avg = times.reduce((a, b) => a + b, 0) / times.length;
	return {
		min: sorted[0],
		p50: percentile(sorted, 50),
		p90: percentile(sorted, 90),
		p99: percentile(sorted, 99),
		max: sorted[sorted.length - 1],
		avg,
	};
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function bench(label: string, fn: () => Promise<unknown>, iterations: number) {
	// Warm up — let JIT compile the hot path before measuring
	for (let i = 0; i < 100; i++) await fn();

	const times: number[] = [];
	for (let i = 0; i < iterations; i++) {
		const t0 = performance.now();
		await fn();
		times.push(performance.now() - t0);
	}

	const s = stats(times);
	console.log(`\n  ${label}`);
	console.log(`  ${"─".repeat(label.length)}`);
	console.log(`  min  ${s.min.toFixed(3)} ms`);
	console.log(`  avg  ${s.avg.toFixed(3)} ms`);
	console.log(`  p50  ${s.p50.toFixed(3)} ms`);
	console.log(`  p90  ${s.p90.toFixed(3)} ms`);
	console.log(`  p99  ${s.p99.toFixed(3)} ms`);
	console.log(`  max  ${s.max.toFixed(3)} ms`);

	return s;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const ITERATIONS = 1000;

console.log(`\nSigning benchmark — ${ITERATIONS} iterations each, 100 warm-up calls\n`);
console.log("What's being measured: the full sign() call that fires on every order submission.");
console.log("Before: viem recomputes domain separator + type hashes on each call.");
console.log("After:  pre-computed constants, only dynamic structHash + digest per order.\n");

const before = await bench("Before  (full EIP-712 pipeline via viem)", signBefore, ITERATIONS);
const after = await bench("After   (createL1AgentWallet, pre-computed)", signAfter, ITERATIONS);

const speedup = before.p50 / after.p50;
const savedPerOrder = before.p50 - after.p50;

console.log(`\n  Speedup (p50): ${speedup.toFixed(1)}×`);
console.log(`  Saved per order: ~${savedPerOrder.toFixed(3)} ms`);
console.log(
	`  Saved per 100 orders: ~${(savedPerOrder * 100).toFixed(1)} ms  (${(savedPerOrder * 100).toFixed(0)} ms of pure CPU overhead eliminated)\n`,
);
