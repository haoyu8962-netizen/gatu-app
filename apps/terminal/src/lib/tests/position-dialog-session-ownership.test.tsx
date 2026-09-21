/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	IsolatedMarginPositionTarget,
	LimitClosePositionData,
	TpSlPositionTarget,
} from "@/components/trade/positions/position-dialog-types";
import type { PositionCloseAllSnapshot } from "@/domain/trade/position-close-all";
import type { PositionReverseTarget } from "@/hooks/trade/use-position-reverse-submit";

const identity = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111" as string | undefined,
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	isConnected: true,
}));
const rendered = vi.hoisted(() => ({
	closeAll: null as Record<string, unknown> | null,
	reverse: null as Record<string, unknown> | null,
	limitClose: null as Record<string, unknown> | null,
	tpSl: null as Record<string, unknown> | null,
	isolatedMargin: null as Record<string, unknown> | null,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ isConnected: identity.isConnected, address: identity.address }),
}));
vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: identity.clientKey, env: identity.env }),
}));
vi.mock("@/components/trade/positions/position-close-all-modal", () => ({
	PositionCloseAllController: (props: Record<string, unknown>) => {
		rendered.closeAll = props;
		return null;
	},
}));
vi.mock("@/components/trade/positions/position-reverse-confirmation-controller", () => ({
	PositionReverseConfirmationController: (props: Record<string, unknown>) => {
		rendered.reverse = props;
		return null;
	},
}));
vi.mock("@/components/trade/positions/position-limit-close-modal", () => ({
	PositionLimitCloseModal: (props: Record<string, unknown>) => {
		rendered.limitClose = props;
		return null;
	},
}));
vi.mock("@/components/trade/positions/position-tpsl-modal", () => ({
	PositionTpSlModal: (props: Record<string, unknown>) => {
		rendered.tpSl = props;
		return null;
	},
}));
vi.mock("@/components/trade/positions/position-isolated-margin-modal", () => ({
	PositionIsolatedMarginModal: (props: Record<string, unknown>) => {
		rendered.isolatedMargin = props;
		return null;
	},
}));

import { PositionDialogHost } from "@/components/trade/positions/position-dialog-host";
import {
	resetPositionDialogSessions,
	useHasPositionDialogSession,
	usePositionDialogActions,
} from "@/stores/use-position-dialog-store";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const OWNER = "0x1111111111111111111111111111111111111111";

function snapshot(owner = OWNER, env: "Mainnet" | "Testnet" = "Mainnet"): PositionCloseAllSnapshot {
	return { owner, env, capturedAtMs: 1, targets: [], summaryTotals: [] };
}

function reverseTarget(coin: string, owner = OWNER): PositionReverseTarget {
	return {
		owner,
		env: "Mainnet",
		coin,
		dex: "",
		assetId: 1,
		szDecimals: 2,
		signedPositionSize: "1.5",
		marginMode: "cross",
	};
}

const limitPosition = { coin: "HYPE", dex: "", assetId: 1 } as unknown as LimitClosePositionData;

function tpSlTarget(coin: string, owner = OWNER): TpSlPositionTarget {
	return { coin, dex: "", assetId: 1, owner, env: "Mainnet" } as unknown as TpSlPositionTarget;
}

function marginTarget(coin: string, owner = OWNER): IsolatedMarginPositionTarget {
	return { coin, dex: "", assetId: 1, owner, env: "Mainnet" } as unknown as IsolatedMarginPositionTarget;
}

describe("position dialog sessions live above the position lists", () => {
	let container: HTMLDivElement;
	let root: Root;
	let actions: ReturnType<typeof usePositionDialogActions>;
	let hasSession = false;

	function Probe() {
		actions = usePositionDialogActions();
		hasSession = useHasPositionDialogSession();
		return createElement(PositionDialogHost);
	}

	beforeEach(() => {
		Object.assign(identity, { address: OWNER, clientKey: OWNER, env: "Mainnet", isConnected: true });
		Object.assign(rendered, { closeAll: null, reverse: null, limitClose: null, tpSl: null, isolatedMargin: null });
		resetPositionDialogSessions();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(createElement(Probe)));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		resetPositionDialogSessions();
	});

	function sessionId(slot: keyof typeof rendered): string | undefined {
		return (rendered[slot]?.session as { sessionId: string } | null)?.sessionId;
	}

	it("ignores a second open for the same account while a session exists", () => {
		act(() => actions.openReverse(reverseTarget("HYPE")));
		const first = sessionId("reverse");
		expect(first).toBeDefined();

		act(() => actions.openReverse(reverseTarget("BTC")));
		expect(sessionId("reverse")).toBe(first);
		expect((rendered.reverse?.session as { target: PositionReverseTarget }).target.coin).toBe("HYPE");

		act(() => actions.openLimitClose(limitPosition));
		const limit = sessionId("limitClose");
		act(() => actions.openLimitClose({ ...limitPosition, coin: "BTC" } as LimitClosePositionData));
		expect(sessionId("limitClose")).toBe(limit);

		act(() => actions.openCloseAll(snapshot()));
		const closeAll = sessionId("closeAll");
		act(() => actions.openCloseAll(snapshot()));
		expect(sessionId("closeAll")).toBe(closeAll);

		act(() => actions.openTpSl(tpSlTarget("HYPE")));
		const tpSl = sessionId("tpSl");
		act(() => actions.openTpSl(tpSlTarget("BTC")));
		expect(sessionId("tpSl")).toBe(tpSl);
		expect((rendered.tpSl?.session as { position: TpSlPositionTarget }).position.coin).toBe("HYPE");

		act(() => actions.openIsolatedMargin(marginTarget("HYPE")));
		const margin = sessionId("isolatedMargin");
		act(() => actions.openIsolatedMargin(marginTarget("BTC")));
		expect(sessionId("isolatedMargin")).toBe(margin);
	});

	it.each([
		["tpSl", "openTpSl", "endTpSl", tpSlTarget],
		["isolatedMargin", "openIsolatedMargin", "endIsolatedMargin", marginTarget],
	] as const)("scopes the end of a %s session to its own id", (slot, open, end, target) => {
		act(() => actions[open](target("HYPE") as never));
		const first = sessionId(slot) ?? "";
		act(() => (rendered[slot]?.onSessionEnd as (id: string) => void)(first));
		expect(rendered[slot]?.session).toBeNull();

		act(() => actions[open](target("HYPE") as never));
		const second = sessionId(slot);
		expect(second).not.toBe(first);
		act(() => actions[end](first));
		expect(sessionId(slot)).toBe(second);
		expect(hasSession).toBe(true);
	});

	it("gives a reopened target a new session instead of reusing the finished instance", () => {
		act(() => actions.openReverse(reverseTarget("HYPE")));
		const first = sessionId("reverse");
		act(() => (rendered.reverse?.onSessionEnd as (id: string) => void)(first ?? ""));
		expect(rendered.reverse?.session).toBeNull();

		act(() => actions.openReverse(reverseTarget("HYPE")));
		expect(sessionId("reverse")).toBeDefined();
		expect(sessionId("reverse")).not.toBe(first);
	});

	it("does not let a late end from a finished session close the one that replaced it", () => {
		act(() => actions.openReverse(reverseTarget("HYPE")));
		const first = sessionId("reverse") ?? "";
		act(() => actions.endReverse(first));
		act(() => actions.openReverse(reverseTarget("HYPE")));
		const second = sessionId("reverse");

		act(() => actions.endReverse(first));
		expect(sessionId("reverse")).toBe(second);
		expect(hasSession).toBe(true);

		act(() => actions.endReverse(second ?? ""));
		expect(hasSession).toBe(false);
	});

	it("hides a close-all session from another account and lets the current account start its own", () => {
		act(() => actions.openCloseAll(snapshot("0x2222222222222222222222222222222222222222")));
		expect(rendered.closeAll?.session).toBeNull();

		act(() => actions.openCloseAll(snapshot()));
		expect((rendered.closeAll?.session as { snapshot: PositionCloseAllSnapshot }).snapshot.owner).toBe(OWNER);
	});

	it.each(["positions/positions-tab.tsx", "mobile/mobile-positions-tab.tsx"])(
		"%s opens sessions through the store and no longer mounts their owners",
		(file) => {
			const source = readFileSync(resolve(__dirname, "../../components/trade", file), "utf8");
			expect(source).toContain("usePositionDialogActions()");
			expect(source).not.toContain("position-close-all-modal");
			expect(source).not.toContain("position-limit-close-modal");
			expect(source).not.toContain("position-reverse-confirmation-controller");
			expect(source).not.toContain("position-tpsl-modal");
			expect(source).not.toContain("position-isolated-margin-modal");
		},
	);

	it("mounts the owners from the global modal host, outside every tab panel", () => {
		const globalModals = readFileSync(
			resolve(__dirname, "../../components/trade/components/global-modals.tsx"),
			"utf8",
		);
		expect(globalModals).toContain("{props.enablePositionMarketClose && <PositionDialogHostGate />}");
	});
});
