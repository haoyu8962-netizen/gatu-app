// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionMarketCloseSubmitHostGate } from "@/components/trade/components/position-market-close-submit-host-gate";
import { warmPositionMarketCloseSubmitHost } from "@/components/trade/components/position-market-close-submit-host-loader";
import {
	getPositionMarketCloseActions,
	getPositionMarketCloseModal,
	type PositionMarketCloseRef,
} from "@/stores/use-global-modal-store";

const mocks = vi.hoisted(() => ({ hostImports: 0, abandon: vi.fn() }));

vi.mock("@/components/trade/components/position-market-close-submit-host", () => {
	mocks.hostImports += 1;
	return {
		PositionMarketCloseSubmitHost: () => createElement("div", { "data-testid": "PositionMarketCloseSubmitHost" }),
	};
});

vi.mock("@/lib/trade/position-market-close-submitter", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/trade/position-market-close-submitter")>();
	return { ...actual, abandonWaitingPositionMarketCloseAttempts: mocks.abandon };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const USER = "0x1111111111111111111111111111111111111111" as const;
const positionRef: PositionMarketCloseRef = {
	coin: "xyz:CXMT",
	dex: "xyz",
	assetId: 120_031,
	szDecimals: 3,
	signedPositionSize: "2.500",
	markPx: "90",
	marginMode: "isolated",
};

async function flush() {
	await act(async () => {
		await Promise.resolve();
	});
}

describe("PositionMarketCloseSubmitHostGate", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.abandon.mockReset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		const session = getPositionMarketCloseModal();
		if (session) {
			getPositionMarketCloseActions().updatePhase(session.sessionId, "idle");
			getPositionMarketCloseActions().close(session.sessionId);
		}
	});

	it("does not load the host at mount and abandons waiting attempts only when it unmounts", async () => {
		act(() => root.render(createElement(PositionMarketCloseSubmitHostGate)));
		await flush();

		expect(mocks.hostImports).toBe(0);
		expect(container.querySelector('[data-testid="PositionMarketCloseSubmitHost"]')).toBeNull();
		expect(mocks.abandon).not.toHaveBeenCalled();

		act(() => root.unmount());
		expect(mocks.abandon).toHaveBeenCalledOnce();
		root = createRoot(container);
	});

	it("loads and mounts the host once a market close session opens", async () => {
		act(() => root.render(createElement(PositionMarketCloseSubmitHostGate)));
		act(() => {
			getPositionMarketCloseActions().open(positionRef, { owner: USER, env: "Mainnet" });
		});
		await act(async () => {
			await vi.waitFor(() =>
				expect(container.querySelector('[data-testid="PositionMarketCloseSubmitHost"]')).not.toBeNull(),
			);
		});
		expect(mocks.hostImports).toBe(1);
	});

	it("loads the host on intent from a positions surface without a session", async () => {
		act(() => root.render(createElement(PositionMarketCloseSubmitHostGate)));
		act(() => warmPositionMarketCloseSubmitHost());
		await act(async () => {
			await vi.waitFor(() =>
				expect(container.querySelector('[data-testid="PositionMarketCloseSubmitHost"]')).not.toBeNull(),
			);
		});
	});
});
