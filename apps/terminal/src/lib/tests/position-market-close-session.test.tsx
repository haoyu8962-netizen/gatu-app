/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hyperliquidContext = vi.hoisted(() => ({
	clientKey: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
	env: "Mainnet" as "Mainnet" | "Testnet",
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => hyperliquidContext,
}));

import {
	discardPositionMarketCloseModal,
	getPositionMarketCloseActions,
	getPositionMarketCloseModal,
	type PositionMarketCloseActions,
	type PositionMarketCloseRef,
	useCommandMenuActions,
	usePositionMarketCloseActions,
} from "@/stores/use-global-modal-store";

const POSITION: PositionMarketCloseRef = {
	coin: "BTC",
	dex: "",
	assetId: 0,
	szDecimals: 4,
	signedPositionSize: "0.25",
	markPx: "100000",
	marginMode: "cross",
};

describe("position market close session", () => {
	let container: HTMLDivElement;
	let root: Root;
	let closeActions: PositionMarketCloseActions;
	let commandMenuActions: ReturnType<typeof useCommandMenuActions>;

	function Harness() {
		closeActions = usePositionMarketCloseActions();
		commandMenuActions = useCommandMenuActions();
		return null;
	}

	function clearSession() {
		const session = getPositionMarketCloseModal();
		if (!session) return;
		const actions = getPositionMarketCloseActions();
		actions.updatePhase(session.sessionId, "reconciling");
		actions.close(session.sessionId);
	}

	beforeEach(() => {
		clearSession();
		hyperliquidContext.clientKey = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD";
		hyperliquidContext.env = "Mainnet";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(<Harness />));
	});

	afterEach(() => {
		clearSession();
		act(() => root.unmount());
		container.remove();
	});

	it("captures normalized account identity and keeps one max sizing intent", () => {
		let sessionId: string | null = null;
		act(() => {
			sessionId = closeActions.open(POSITION);
		});

		const session = getPositionMarketCloseModal();
		expect(sessionId).toBeTruthy();
		expect(session).toMatchObject({
			sessionId,
			owner: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
			env: "Mainnet",
			position: POSITION,
			sizingIntent: { kind: "max" },
			presentation: "confirmation",
			phase: "idle",
		});

		act(() => commandMenuActions.open());
		expect(getPositionMarketCloseModal()?.sessionId).toBe(sessionId);
	});

	it("does not replace an existing idle session and records direct presentation explicitly", () => {
		let sessionId: string | null = null;
		act(() => {
			sessionId = closeActions.open(POSITION, "direct");
		});

		let duplicateId: string | null = "unexpected";
		act(() => {
			duplicateId = closeActions.open({ ...POSITION, assetId: 1 });
		});

		expect(duplicateId).toBeNull();
		expect(getPositionMarketCloseModal()).toMatchObject({ sessionId, presentation: "direct", position: POSITION });
	});

	it("permanently reveals a direct session after an error or reconciliation requires attention", () => {
		let errorSessionId = "";
		act(() => {
			errorSessionId = closeActions.open(POSITION, "direct") ?? "";
		});
		const actions = getPositionMarketCloseActions();

		act(() => {
			actions.setError(errorSessionId, "Order rejected");
			actions.setError(errorSessionId, null);
			actions.setSizingIntent(errorSessionId, { kind: "percent", value: "50" });
		});
		expect(getPositionMarketCloseModal()).toMatchObject({
			presentation: "confirmation",
			phase: "idle",
			error: null,
			sizingIntent: { kind: "percent", value: "50" },
		});

		act(() => actions.close(errorSessionId));
		let reconcilingSessionId = "";
		act(() => {
			reconcilingSessionId = closeActions.open(POSITION, "direct") ?? "";
			actions.updatePhase(reconcilingSessionId, "reconciling");
			actions.updatePhase(reconcilingSessionId, "idle");
		});
		expect(getPositionMarketCloseModal()).toMatchObject({
			presentation: "confirmation",
			phase: "idle",
		});
	});

	it("rejects late close callbacks and locks validating and submitting sessions", () => {
		let sessionId = "";
		act(() => {
			sessionId = closeActions.open(POSITION) ?? "";
		});
		const actions = getPositionMarketCloseActions();

		act(() => {
			actions.updatePhase(sessionId, "validating");
			actions.close(sessionId);
		});
		expect(getPositionMarketCloseModal()?.phase).toBe("validating");

		act(() => {
			actions.updatePhase(sessionId, "submitting");
			actions.setSizingIntent(sessionId, { kind: "percent", value: "50" });
			actions.close(sessionId);
		});
		expect(getPositionMarketCloseModal()).toMatchObject({
			phase: "submitting",
			sizingIntent: { kind: "max" },
		});

		act(() => {
			actions.updatePhase(sessionId, "reconciling");
			actions.close("stale-session");
		});
		expect(getPositionMarketCloseModal()?.phase).toBe("reconciling");

		act(() => actions.close(sessionId));
		expect(getPositionMarketCloseModal()).toBeNull();
	});

	it("survives desktop and mobile surface remounts without resetting sizing", () => {
		let sessionId = "";
		act(() => {
			sessionId = closeActions.open(POSITION) ?? "";
			getPositionMarketCloseActions().setSizingIntent(sessionId, { kind: "percent", value: "37.5" });
			root.render(null);
		});

		expect(getPositionMarketCloseModal()).toMatchObject({
			sessionId,
			sizingIntent: { kind: "percent", value: "37.5" },
		});

		act(() => root.render(<Harness />));
		expect(getPositionMarketCloseModal()?.sizingIntent).toEqual({ kind: "percent", value: "37.5" });
	});

	it("keeps the session reference stable for redundant idle updates", () => {
		let sessionId = "";
		act(() => {
			sessionId = closeActions.open(POSITION) ?? "";
		});
		const initialSession = getPositionMarketCloseModal();

		act(() => {
			getPositionMarketCloseActions().setError(sessionId, null);
			getPositionMarketCloseActions().setSizingIntent(sessionId, { kind: "max" });
		});

		expect(getPositionMarketCloseModal()).toBe(initialSession);
	});

	it("discards an in-flight session when its route-owned modal surface unmounts", () => {
		let sessionId = "";
		act(() => {
			sessionId = closeActions.open(POSITION) ?? "";
			getPositionMarketCloseActions().updatePhase(sessionId, "submitting");
			discardPositionMarketCloseModal();
		});

		expect(getPositionMarketCloseModal()).toBeNull();
	});

	it.each(["disconnected", "0xABCDEF"])("fails closed for an invalid Hyperliquid account: %s", (clientKey) => {
		hyperliquidContext.clientKey = clientKey;
		act(() => root.render(<Harness />));

		let sessionId: string | null = "unexpected";
		act(() => {
			sessionId = closeActions.open(POSITION);
		});

		expect(sessionId).toBeNull();
		expect(getPositionMarketCloseModal()).toBeNull();
	});
});
