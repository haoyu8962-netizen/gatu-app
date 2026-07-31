// @vitest-environment jsdom

import type { RouteExtended } from "@lifi/sdk";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	clearPersistedBridgeExecution,
	persistCommittedBridgeExecution,
} from "@/lib/lifi/bridge-execution-persistence";
import {
	INITIAL_BRIDGE_STATE,
	useBridgeExecutionState,
	useHasExistingBridgeExecution,
} from "@/lib/lifi/bridge-execution-state";

const SOURCE_ADDRESS = "0x1111111111111111111111111111111111111111";
const HYPERCORE_USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const TX_HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

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
				execution: {
					status: "PENDING",
					startedAt: Date.now() - 1_000,
					process: [
						{
							type: "CROSS_CHAIN",
							status: "PENDING",
							chainId: 42161,
							txHash: TX_HASH,
							startedAt: Date.now() - 1_000,
						},
					],
				},
			},
		],
	} as unknown as RouteExtended;
}

function RecoveryProbe({ walletAddress }: { walletAddress: string }) {
	const hasExistingExecution = useHasExistingBridgeExecution(walletAddress);
	return createElement("span", null, hasExistingExecution ? "existing" : "none");
}

describe("LI.FI bridge post-mount recovery", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		useBridgeExecutionState.setState(INITIAL_BRIDGE_STATE, true);
		clearPersistedBridgeExecution();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		clearPersistedBridgeExecution();
		useBridgeExecutionState.setState(INITIAL_BRIDGE_STATE, true);
	});

	it("keeps the server/client first snapshot idle, then restores after mount for the exact wallet", () => {
		expect(
			persistCommittedBridgeExecution({
				route: createCommittedRoute(),
				expectedToAmount: "997500",
				startTime: Date.now() - 2_000,
			}),
		).toBe(true);

		expect(renderToString(createElement(RecoveryProbe, { walletAddress: SOURCE_ADDRESS }))).toContain("none");
		expect(useBridgeExecutionState.getState().status).toBe("idle");

		act(() => root.render(createElement(RecoveryProbe, { walletAddress: SOURCE_ADDRESS })));

		expect(container.textContent).toBe("existing");
		expect(useBridgeExecutionState.getState()).toMatchObject({
			status: "error",
			canAbandon: false,
			sourceAddress: SOURCE_ADDRESS,
			sourceChainId: 42161,
		});
	});

	it("does not reveal another wallet's recoverable execution", () => {
		expect(
			persistCommittedBridgeExecution({
				route: createCommittedRoute(),
				expectedToAmount: "997500",
				startTime: Date.now() - 2_000,
			}),
		).toBe(true);

		act(() =>
			root.render(
				createElement(RecoveryProbe, {
					walletAddress: "0x2222222222222222222222222222222222222222",
				}),
			),
		);

		expect(container.textContent).toBe("none");
		expect(useBridgeExecutionState.getState().status).toBe("idle");
	});
});
