import type { ExtraAgentsResponse } from "@nktkas/hyperliquid";
import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForExpectedMobileAgent } from "../mobile-sync/remote-verification";
import { MOBILE_AGENT_NAME_BASE } from "../mobile-sync/sync-core";

const NOW_MS = 1_779_364_227_000;
const AGENT_ADDRESS = "0x1111111111111111111111111111111111111111";
const OLD_AGENT_ADDRESS = "0x2222222222222222222222222222222222222222";
const VALID_UNTIL_MS = NOW_MS + 60_000;
const EXPECTED = {
	agentAddress: AGENT_ADDRESS,
	agentNameBase: MOBILE_AGENT_NAME_BASE,
	agentValidUntilMs: VALID_UNTIL_MS,
};

function approvedAgents(includeOld = false): ExtraAgentsResponse {
	return [
		{
			address: AGENT_ADDRESS,
			name: MOBILE_AGENT_NAME_BASE,
			validUntil: VALID_UNTIL_MS,
		},
		...(includeOld
			? [
					{
						address: OLD_AGENT_ADDRESS,
						name: "Another agent",
						validUntil: VALID_UNTIL_MS,
					},
				]
			: []),
	] as ExtraAgentsResponse;
}

describe("waitForExpectedMobileAgent", () => {
	afterEach(() => vi.useRealTimers());

	it("retries network failures and stale reads until the exact Agent appears", async () => {
		const load = vi
			.fn<() => Promise<ExtraAgentsResponse>>()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce(approvedAgents());

		const result = await waitForExpectedMobileAgent(load, EXPECTED, {
			delaysMs: [0, 0, 0],
			now: () => NOW_MS,
		});

		expect(result).toMatchObject({ status: "approved", attempts: 3 });
		expect(load).toHaveBeenCalledTimes(3);
	});

	it("fails closed after the bounded window", async () => {
		const load = vi.fn<() => Promise<ExtraAgentsResponse>>().mockResolvedValue([]);

		const result = await waitForExpectedMobileAgent(load, EXPECTED, {
			delaysMs: [0, 0],
			now: () => NOW_MS,
		});

		expect(result).toEqual({
			status: "unverified",
			attempts: 2,
			hadNetworkError: false,
			lastVerification: { status: "missing" },
		});
	});

	it("waits for an additional revocation reconciliation condition", async () => {
		const load = vi
			.fn<() => Promise<ExtraAgentsResponse>>()
			.mockResolvedValueOnce(approvedAgents(true))
			.mockResolvedValueOnce(approvedAgents(false));

		const result = await waitForExpectedMobileAgent(load, EXPECTED, {
			delaysMs: [0, 0],
			now: () => NOW_MS,
			acceptExtraAgents: (agents) =>
				agents.every((agent) => agent.address.toLowerCase() !== OLD_AGENT_ADDRESS.toLowerCase()),
		});

		expect(result).toMatchObject({ status: "approved", attempts: 2 });
	});

	it("stops without another request after abort", async () => {
		const abortController = new AbortController();
		abortController.abort();
		const load = vi.fn<() => Promise<ExtraAgentsResponse>>();

		await expect(
			waitForExpectedMobileAgent(load, EXPECTED, {
				delaysMs: [0],
				signal: abortController.signal,
			}),
		).resolves.toEqual({ status: "aborted", attempts: 0 });
		expect(load).not.toHaveBeenCalled();
	});

	it("bounds a stalled info request", async () => {
		vi.useFakeTimers();
		let attemptSignal: AbortSignal | undefined;
		const load = vi.fn<(signal: AbortSignal) => Promise<ExtraAgentsResponse>>().mockImplementation((signal) => {
			attemptSignal = signal;
			return new Promise(() => {});
		});

		const pending = waitForExpectedMobileAgent(load, EXPECTED, {
			delaysMs: [0],
			maxElapsedMs: 10,
			requestTimeoutMs: 5,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(attemptSignal?.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(5);

		expect(attemptSignal?.aborted).toBe(true);
		await expect(pending).resolves.toEqual({
			status: "unverified",
			attempts: 1,
			hadNetworkError: true,
			lastVerification: { status: "remote_unknown" },
		});
	});

	it("aborts the active info request when the caller aborts", async () => {
		const abortController = new AbortController();
		let attemptSignal: AbortSignal | undefined;
		const load = vi.fn<(signal: AbortSignal) => Promise<ExtraAgentsResponse>>().mockImplementation((signal) => {
			attemptSignal = signal;
			return new Promise(() => {});
		});

		const pending = waitForExpectedMobileAgent(load, EXPECTED, {
			delaysMs: [0],
			signal: abortController.signal,
		});
		await Promise.resolve();
		expect(attemptSignal?.aborted).toBe(false);

		abortController.abort();

		expect(attemptSignal?.aborted).toBe(true);
		await expect(pending).resolves.toEqual({ status: "aborted", attempts: 1 });
	});
});
