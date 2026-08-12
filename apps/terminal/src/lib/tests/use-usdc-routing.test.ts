import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type HyperliquidEnv, infoKey } from "@gatu/hl-react";
import type { InfoClient } from "@nktkas/hyperliquid";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
	assertFreshBridgeDepositRoute,
	assertFreshDepositRoute,
	executeWithFreshWithdrawalRoute,
	fetchFreshUsdcRouting,
	getUsdcRoutingQueryOptions,
	USDC_ROUTING_REFRESH_INTERVAL_MS,
	UsdcDepositRouteError,
} from "@/hooks/trade/use-usdc-routing";

const MAINNET: HyperliquidEnv = "Mainnet";
const TESTNET: HyperliquidEnv = "Testnet";
const USE_DEPOSIT_SOURCE = readFileSync(
	fileURLToPath(new URL("../hyperliquid/use-deposit.ts", import.meta.url)),
	"utf8",
);

describe("fresh USDC routing", () => {
	it("polls enabled routing views and stops polling when disabled", () => {
		expect(getUsdcRoutingQueryOptions(true)).toMatchObject({
			enabled: true,
			refetchInterval: USDC_ROUTING_REFRESH_INTERVAL_MS,
			refetchIntervalInBackground: false,
			refetchOnWindowFocus: true,
			staleTime: USDC_ROUTING_REFRESH_INTERVAL_MS,
		});
		expect(getUsdcRoutingQueryOptions(false)).toMatchObject({
			enabled: false,
			refetchInterval: false,
		});
	});

	it("bypasses a just-populated cache and sends a new SDK request", async () => {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const usdcRouting = vi
			.fn()
			.mockResolvedValueOnce({ depositRoute: "bridge", withdrawalRoute: "bridge" })
			.mockResolvedValueOnce({ depositRoute: "cctp", withdrawalRoute: "cctp" });
		const info = { usdcRouting } as unknown as InfoClient;

		await expect(fetchFreshUsdcRouting(queryClient, info, MAINNET)).resolves.toEqual({
			depositRoute: "bridge",
			withdrawalRoute: "bridge",
		});
		await expect(fetchFreshUsdcRouting(queryClient, info, MAINNET)).resolves.toEqual({
			depositRoute: "cctp",
			withdrawalRoute: "cctp",
		});

		expect(usdcRouting).toHaveBeenCalledTimes(2);
		expect(queryClient.getQueryData(infoKey("usdcRouting", undefined, MAINNET))).toEqual({
			depositRoute: "cctp",
			withdrawalRoute: "cctp",
		});
	});

	it("keeps fresh route guards at every wallet boundary and inside the locked CCTP critical section", () => {
		const depositExecution = USE_DEPOSIT_SOURCE.slice(USE_DEPOSIT_SOURCE.indexOf("const deposit = useCallback"));
		const guardIndexes = [...depositExecution.matchAll(/await assertFreshSelectedDepositRoute\(\)/g)].map(
			(match) => match.index,
		);
		const amountParsingIndex = depositExecution.indexOf("parseUnits(amount, USDC_DECIMALS)");
		const permitSigningIndex = depositExecution.indexOf("createBridge2PermitCall");
		const smartWalletSendIndex = depositExecution.indexOf("smartClient.sendTransaction");
		const cctpLockIndex = depositExecution.indexOf("runWithFundsActionLock(");
		const bridgeNonceIndex = depositExecution.indexOf("const transactionNonce", cctpLockIndex);
		const cctpCriticalSection = depositExecution.slice(cctpLockIndex, bridgeNonceIndex);
		const cctpGuardIndexes = [...cctpCriticalSection.matchAll(/await assertFreshSelectedDepositRoute\(\)/g)].map(
			(match) => match.index ?? -1,
		);
		const pendingDepositCheckIndex = cctpCriticalSection.indexOf("readCctpDepositTrackingRecords");
		const cctpRoleIndex = cctpCriticalSection.indexOf("getSdkInfoClient(false).userRole");
		const cctpSigningIndex = cctpCriticalSection.indexOf("ready.walletClient.signTypedData");
		const cctpSendIndex = cctpCriticalSection.indexOf("ready.walletClient.writeContract");
		const cctpTrackingSaveIndex = cctpCriticalSection.indexOf("saveCctpDepositTrackingRecord");
		const bridgeWalletSendIndex = depositExecution.indexOf("ready.walletClient.writeContract", bridgeNonceIndex);
		const finalGuardIndex = guardIndexes.at(-1) ?? -1;

		expect(guardIndexes[0]).toBeLessThan(amountParsingIndex);
		expect(guardIndexes[1]).toBeLessThan(permitSigningIndex);
		expect(guardIndexes[2]).toBeLessThan(smartWalletSendIndex);
		expect(cctpLockIndex).toBeGreaterThan(smartWalletSendIndex);
		expect(cctpGuardIndexes).toHaveLength(5);
		expect(pendingDepositCheckIndex).toBeGreaterThan(0);
		expect(pendingDepositCheckIndex).toBeLessThan(cctpRoleIndex);
		expect(cctpGuardIndexes[0]).toBeLessThan(cctpRoleIndex);
		expect(cctpGuardIndexes.some((index) => index < cctpSigningIndex)).toBe(true);
		expect(cctpGuardIndexes.at(-1)).toBeLessThan(cctpSendIndex);
		expect(cctpTrackingSaveIndex).toBeGreaterThan(cctpSendIndex);
		expect(finalGuardIndex).toBeGreaterThan(bridgeNonceIndex);
		expect(finalGuardIndex).toBeLessThan(bridgeWalletSendIndex);
	});

	it("keeps Mainnet and Testnet routing caches isolated", async () => {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const mainnetInfo = {
			usdcRouting: vi.fn().mockResolvedValue({ depositRoute: "bridge", withdrawalRoute: "bridge" }),
		} as unknown as InfoClient;
		const testnetInfo = {
			usdcRouting: vi.fn().mockResolvedValue({ depositRoute: "cctp", withdrawalRoute: "cctp" }),
		} as unknown as InfoClient;

		await fetchFreshUsdcRouting(queryClient, mainnetInfo, MAINNET);
		await fetchFreshUsdcRouting(queryClient, testnetInfo, TESTNET);

		expect(queryClient.getQueryData(infoKey("usdcRouting", undefined, MAINNET))).toEqual({
			depositRoute: "bridge",
			withdrawalRoute: "bridge",
		});
		expect(queryClient.getQueryData(infoKey("usdcRouting", undefined, TESTNET))).toEqual({
			depositRoute: "cctp",
			withdrawalRoute: "cctp",
		});
	});

	it("does not update the canonical cache when an SDK request resolves after cancellation", async () => {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		let resolveRouting = (_value: { depositRoute: "bridge"; withdrawalRoute: "bridge" }) => {};
		const usdcRouting = vi.fn(
			() =>
				new Promise<{ depositRoute: "bridge"; withdrawalRoute: "bridge" }>((resolve) => {
					resolveRouting = resolve;
				}),
		);
		const info = { usdcRouting } as unknown as InfoClient;
		const controller = new AbortController();
		const cancellation = new Error("routing guard timed out");
		const request = fetchFreshUsdcRouting(queryClient, info, MAINNET, controller.signal);
		await vi.waitFor(() => expect(usdcRouting).toHaveBeenCalledOnce());

		controller.abort(cancellation);
		resolveRouting({ depositRoute: "bridge", withdrawalRoute: "bridge" });

		await expect(request).rejects.toBe(cancellation);
		expect(queryClient.getQueryData(infoKey("usdcRouting", undefined, MAINNET))).toBeUndefined();
	});

	it("allows Bridge2 only after a fresh bridge response", async () => {
		await expect(
			assertFreshBridgeDepositRoute(async () => ({ depositRoute: "bridge", withdrawalRoute: "cctp" })),
		).resolves.toBeUndefined();
	});

	it("allows CCTP only after a fresh CCTP response and rejects a route flip", async () => {
		await expect(
			assertFreshDepositRoute("cctp", async () => ({ depositRoute: "cctp", withdrawalRoute: "cctp" })),
		).resolves.toBeUndefined();
		await expect(
			assertFreshDepositRoute("cctp", async () => ({ depositRoute: "bridge", withdrawalRoute: "cctp" })),
		).rejects.toMatchObject({ reason: "changed" });
	});

	it.each([
		{ expectedReason: "unavailable", fetchRouting: async () => null },
		{
			expectedReason: "unavailable",
			fetchRouting: async () => {
				throw new Error("transport failed");
			},
		},
		{
			expectedReason: "cctp",
			fetchRouting: async () => ({ depositRoute: "cctp" as const, withdrawalRoute: "cctp" as const }),
		},
	])("blocks Bridge2 with $expectedReason when fresh routing is unsafe", async ({ expectedReason, fetchRouting }) => {
		const error = await assertFreshBridgeDepositRoute(fetchRouting).catch((caught) => caught);
		expect(error).toBeInstanceOf(UsdcDepositRouteError);
		expect(error).toMatchObject({ reason: expectedReason });
	});

	it("executes a withdrawal only when the last route refresh is unchanged", async () => {
		const execute = vi.fn().mockResolvedValue(undefined);

		await expect(
			executeWithFreshWithdrawalRoute(
				"arbitrum-cctp",
				async () => ({ depositRoute: "cctp", withdrawalRoute: "cctp" }),
				execute,
			),
		).resolves.toBe("executed");
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it.each([
		{
			expectedStatus: "changed",
			fetchRouting: async () => ({ depositRoute: "cctp" as const, withdrawalRoute: "bridge" as const }),
		},
		{
			expectedStatus: "unavailable",
			fetchRouting: async () => null,
		},
		{
			expectedStatus: "unavailable",
			fetchRouting: async () => {
				throw new Error("routing request cancelled");
			},
		},
	])(
		"does not sign when the final withdrawal route check is $expectedStatus",
		async ({ expectedStatus, fetchRouting }) => {
			const execute = vi.fn().mockResolvedValue(undefined);

			await expect(executeWithFreshWithdrawalRoute("arbitrum-cctp", fetchRouting, execute)).resolves.toBe(
				expectedStatus,
			);
			expect(execute).not.toHaveBeenCalled();
		},
	);
});
