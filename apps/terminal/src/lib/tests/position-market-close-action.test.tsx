/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PositionMarketCloseRef } from "@/components/trade/positions/position-dialog-types";
import { usePositionMarketCloseAction } from "@/hooks/trade/use-position-market-close-action";
import { dismissPositionMarketCloseConfirmation } from "@/lib/trade/position-market-close-confirmation-preference";
import { registerPositionMarketCloseSubmitter } from "@/lib/trade/position-market-close-submitter";
import { getPositionMarketCloseActions, getPositionMarketCloseModal } from "@/stores/use-global-modal-store";

const USER = "0x1111111111111111111111111111111111111111" as const;
const POSITION: PositionMarketCloseRef = {
	coin: "xyz:MU",
	dex: "xyz",
	assetId: 120_001,
	szDecimals: 3,
	signedPositionSize: "5.179",
	markPx: "2.5",
	marginMode: "cross",
};

const mocks = vi.hoisted(() => ({
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	legalState: "accepted",
	agentReady: true,
	agentLoading: false,
	hip3Accepted: true,
	isMobile: false,
	marketLoading: false,
	marketError: null as Error | null,
	market: {
		kind: "builderPerp",
		name: "xyz:MU",
		dex: "xyz",
		assetId: 120_001,
		szDecimals: 3,
	} as Record<string, unknown> | undefined,
	submit: vi.fn(async () => {}),
}));

vi.mock("@/hooks/trade/use-legal-gate", () => ({
	useLegalGate: () => ({ state: mocks.legalState }),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => mocks.isMobile,
}));

vi.mock("@/stores/use-hip3-disclaimer-store", () => ({
	useHasAcceptedHip3Disclaimer: () => mocks.hip3Accepted,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: mocks.clientKey, env: mocks.env }),
	useTradingStatus: () => ({ isReady: mocks.agentReady, isLoading: mocks.agentLoading }),
	useMarkets: () => ({
		isLoading: mocks.marketLoading,
		error: mocks.marketError,
		getMarket: () => mocks.market,
	}),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof usePositionMarketCloseAction> | null = null;
let unregisterSubmitter = () => {};
let hookRenderCount = 0;

function Probe() {
	hookRenderCount += 1;
	hookValue = usePositionMarketCloseAction();
	return null;
}

function currentHook(): ReturnType<typeof usePositionMarketCloseAction> {
	if (!hookValue) throw new Error("Expected position market close action hook");
	return hookValue;
}

function clearSession() {
	const session = getPositionMarketCloseModal();
	if (!session) return;
	getPositionMarketCloseActions().updatePhase(session.sessionId, "idle");
	getPositionMarketCloseActions().close(session.sessionId);
}

describe("usePositionMarketCloseAction", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		clearSession();
		window.localStorage.clear();
		mocks.clientKey = USER;
		mocks.env = "Mainnet";
		mocks.legalState = "accepted";
		mocks.agentReady = true;
		mocks.agentLoading = false;
		mocks.hip3Accepted = true;
		mocks.isMobile = false;
		mocks.marketLoading = false;
		mocks.marketError = null;
		mocks.market = {
			kind: "builderPerp",
			name: "xyz:MU",
			dex: "xyz",
			assetId: POSITION.assetId,
			szDecimals: POSITION.szDecimals,
		};
		mocks.submit.mockClear();
		unregisterSubmitter = registerPositionMarketCloseSubmitter(mocks.submit);
		hookRenderCount = 0;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(<Probe />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		hookValue = null;
		unregisterSubmitter();
		clearSession();
	});

	it("opens the ordinary confirmation when no preference is saved", () => {
		act(() => currentHook().open(POSITION));

		expect(getPositionMarketCloseModal()).toMatchObject({
			presentation: "confirmation",
			sizingIntent: { kind: "max" },
		});
		expect(mocks.submit).not.toHaveBeenCalled();
	});

	it("does not invalidate the position action consumer for idle sizing edits", () => {
		expect(hookRenderCount).toBe(1);
		let sessionId = "";
		act(() => {
			sessionId = currentHook().open(POSITION) ?? "";
			getPositionMarketCloseActions().setSizingIntent(sessionId, { kind: "percent", value: "25" });
			getPositionMarketCloseActions().setSizingIntent(sessionId, { kind: "percent", value: "50" });
		});

		expect(currentHook().pendingAssetId).toBeNull();
		expect(hookRenderCount).toBe(1);

		act(() => getPositionMarketCloseActions().updatePhase(sessionId, "validating"));
		expect(currentHook().pendingAssetId).toBe(POSITION.assetId);
		expect(hookRenderCount).toBe(2);
	});

	it("submits Max directly from the same click only when every gate is ready", () => {
		expect(dismissPositionMarketCloseConfirmation({ owner: USER, env: "Mainnet" })).toBe("dismissed");

		let firstSessionId: string | null = null;
		let secondSessionId: string | null = null;
		act(() => {
			firstSessionId = currentHook().open(POSITION);
			secondSessionId = currentHook().open(POSITION);
		});

		expect(firstSessionId).toEqual(expect.any(String));
		expect(secondSessionId).toBeNull();
		expect(getPositionMarketCloseModal()).toMatchObject({
			sessionId: firstSessionId,
			presentation: "direct",
			sizingIntent: { kind: "max" },
		});
		expect(mocks.submit).toHaveBeenCalledOnce();
		expect(mocks.submit).toHaveBeenCalledWith({ sessionId: firstSessionId, confirmedCloseSize: null });
	});

	it("falls back to the confirmation dialog while no page-level submit host is mounted", () => {
		expect(dismissPositionMarketCloseConfirmation({ owner: USER, env: "Mainnet" })).toBe("dismissed");
		unregisterSubmitter();

		act(() => currentHook().open(POSITION));

		expect(getPositionMarketCloseModal()).toMatchObject({ presentation: "confirmation", phase: "idle" });
		expect(mocks.submit).not.toHaveBeenCalled();
	});

	it("honors the dismissed confirmation preference on mobile when every gate is ready", () => {
		expect(dismissPositionMarketCloseConfirmation({ owner: USER, env: "Mainnet" })).toBe("dismissed");
		mocks.isMobile = true;
		act(() => root.render(<Probe />));

		act(() => currentHook().open(POSITION));

		const session = getPositionMarketCloseModal();
		expect(session).toMatchObject({
			presentation: "direct",
			sizingIntent: { kind: "max" },
		});
		expect(mocks.submit).toHaveBeenCalledWith({ sessionId: session?.sessionId, confirmedCloseSize: null });
	});

	it.each([
		[
			"legal acceptance",
			() => {
				mocks.legalState = "required";
			},
		],
		[
			"agent readiness",
			() => {
				mocks.agentReady = false;
			},
		],
		[
			"agent status loading",
			() => {
				mocks.agentLoading = true;
			},
		],
		[
			"HIP-3 acceptance",
			() => {
				mocks.hip3Accepted = false;
			},
		],
		[
			"market loading",
			() => {
				mocks.marketLoading = true;
			},
		],
		[
			"market identity",
			() => {
				mocks.market = { ...mocks.market, assetId: 7 };
			},
		],
	])("does not bypass %s", (_label, makeUnavailable) => {
		dismissPositionMarketCloseConfirmation({ owner: USER, env: "Mainnet" });
		makeUnavailable();
		act(() => root.render(<Probe />));

		act(() => currentHook().open(POSITION));

		expect(getPositionMarketCloseModal()?.presentation).toBe("confirmation");
		expect(mocks.submit).not.toHaveBeenCalled();
	});
});
