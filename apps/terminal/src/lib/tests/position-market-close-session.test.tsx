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
	useGlobalModalType,
	usePositionMarketCloseActions,
	useSendModalActions,
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
	let sendActions: ReturnType<typeof useSendModalActions>;
	let activeModal: ReturnType<typeof useGlobalModalType>;

	function Harness() {
		closeActions = usePositionMarketCloseActions();
		commandMenuActions = useCommandMenuActions();
		sendActions = useSendModalActions();
		activeModal = useGlobalModalType();
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
		act(() => {
			clearSession();
			commandMenuActions.close();
			sendActions.close();
			root.unmount();
		});
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

	it("never reveals a direct session and only dismisses an idle confirmation session", () => {
		let directSessionId = "";
		act(() => {
			directSessionId = closeActions.open(POSITION, "direct") ?? "";
		});
		const actions = getPositionMarketCloseActions();

		act(() => {
			actions.updatePhase(directSessionId, "reconciling");
			actions.updatePhase(directSessionId, "idle");
			actions.dismiss(directSessionId);
		});
		expect(getPositionMarketCloseModal()).toMatchObject({ presentation: "direct", phase: "idle" });

		act(() => actions.close(directSessionId));
		let confirmationSessionId = "";
		act(() => {
			confirmationSessionId = closeActions.open(POSITION) ?? "";
			actions.updatePhase(confirmationSessionId, "validating");
			actions.dismiss(confirmationSessionId);
		});
		expect(getPositionMarketCloseModal()?.presentation).toBe("confirmation");

		act(() => {
			actions.updatePhase(confirmationSessionId, "idle");
			actions.dismiss("stale-session");
			actions.dismiss(confirmationSessionId);
			actions.updatePhase(confirmationSessionId, "reconciling");
		});
		expect(getPositionMarketCloseModal()).toMatchObject({ presentation: "dismissed", phase: "reconciling" });
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
			getPositionMarketCloseActions().dismiss("stale-session");
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

	it("does not let a stale ordinary-modal close callback dismiss its replacement", () => {
		act(() => sendActions.open("USDC", "spot"));
		expect(activeModal).toBe("send");

		act(() => commandMenuActions.open());
		expect(activeModal).toBe("commandMenu");

		act(() => sendActions.close());
		expect(activeModal).toBe("commandMenu");

		act(() => commandMenuActions.close());
		expect(activeModal).toBeNull();
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
