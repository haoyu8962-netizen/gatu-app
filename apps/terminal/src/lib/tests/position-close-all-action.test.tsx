/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111",
	clientKey: "0x1111111111111111111111111111111111111111",
	isConnected: true,
	isStale: false,
	missingMarket: false,
	size: "1.25",
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({ useWalletSession: () => data }));
vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: data.clientKey, env: "Mainnet" }),
	useMarkets: () => ({
		isLoading: false,
		error: null,
		getMarket: (coin: string) =>
			data.missingMarket
				? undefined
				: {
						assetId: coin === "HYPE" ? 0 : 100000,
						szDecimals: 2,
						kind: coin === "HYPE" ? "perp" : "builderPerp",
						quoteToken: { name: "USDE" },
					},
	}),
	useUserPositions: () => ({
		isLoading: false,
		hasError: false,
		isStale: data.isStale,
		positions: [
			{ coin: "HYPE", dex: "", szi: data.size, positionValue: "125", unrealizedPnl: "5", leverage: { type: "cross" } },
			{
				coin: "xyz:TEST",
				dex: "xyz",
				szi: "-2.5",
				positionValue: "250",
				unrealizedPnl: "-1",
				leverage: { type: "isolated" },
			},
		],
	}),
}));

import { usePositionCloseAllAction } from "@/hooks/trade/use-position-close-all-action";
import {
	type PositionCloseAllSession,
	resetPositionDialogSessions,
	usePositionCloseAllSession,
	usePositionDialogActions,
} from "@/stores/use-position-dialog-store";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("shared close-all entry", () => {
	let container: HTMLDivElement;
	let root: Root;
	let action: ReturnType<typeof usePositionCloseAllAction>;
	let session: PositionCloseAllSession | null;
	let actions: ReturnType<typeof usePositionDialogActions>;

	function Probe() {
		action = usePositionCloseAllAction();
		session = usePositionCloseAllSession();
		actions = usePositionDialogActions();
		return null;
	}

	function render() {
		act(() => root.render(createElement(I18nProvider, { i18n }, createElement(Probe))));
	}

	beforeEach(() => {
		Object.assign(data, {
			isConnected: true,
			isStale: false,
			missingMarket: false,
			size: "1.25",
			clientKey: data.address,
		});
		resetPositionDialogSessions();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		root = createRoot(container);
		render();
	});

	afterEach(() => {
		act(() => root.unmount());
		resetPositionDialogSessions();
		vi.restoreAllMocks();
	});

	it("captures the whole account at click time instead of aging from the first render", () => {
		vi.spyOn(Date, "now").mockReturnValue(1000);
		render();
		vi.spyOn(Date, "now").mockReturnValue(61000);
		act(() => action.open());
		expect(session?.snapshot.capturedAtMs).toBe(61000);
		expect(session?.snapshot.targets.map(({ coin, signedPositionSize }) => [coin, signedPositionSize])).toEqual([
			["HYPE", "1.25"],
			["xyz:TEST", "-2.5"],
		]);
		expect(session?.snapshot.summaryTotals.map(({ quoteSymbol }) => quoteSymbol)).toEqual(["USDC", "USDE"]);
	});

	it("keeps the first session for duplicate opens and rejects late cleanup after reopening", () => {
		const open = action.open;
		act(() => {
			open();
			open();
		});
		const first = session;
		expect(first).not.toBeNull();
		expect(action.canOpen).toBe(false);
		act(() => action.open());
		expect(session).toBe(first);
		if (!first) throw new Error("Missing session");
		act(() => actions.endCloseAll(first.sessionId));
		data.size = "3";
		render();
		act(() => action.open());
		const second = session;
		expect(second?.sessionId).not.toBe(first.sessionId);
		expect(second?.snapshot.targets[0].signedPositionSize).toBe("3");
		act(() => actions.endCloseAll(first.sessionId));
		expect(session).toBe(second);
	});

	it.each(["isStale", "missingMarket"] as const)("does not create a partial snapshot when %s is true", (key) => {
		data[key] = true;
		render();
		expect(action.canOpen).toBe(false);
		act(() => action.open());
		expect(session).toBeNull();
		data[key] = false;
		render();
		expect(action.canOpen).toBe(true);
	});
});
