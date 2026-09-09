// @vitest-environment jsdom

import type { AllDexsClearinghouseStateWsEvent } from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUserPositions } from "../../../../../packages/hl-react/src/account/use-user-positions";

const state = vi.hoisted(() => ({
	clientKey: "0x1111111111111111111111111111111111111111",
	status: "active",
	data: undefined as AllDexsClearinghouseStateWsEvent | undefined,
	isStale: false,
}));

vi.mock("../../../../../packages/hl-react/src/provider", () => ({
	useHyperliquid: () => ({ clientKey: state.clientKey }),
}));
vi.mock("../../../../../packages/hl-react/src/hooks/useSubscription", () => ({
	useSubscription: (method: string) => (method === "allDexsClearinghouseState" ? state : { data: undefined }),
}));

describe("position snapshot readiness", () => {
	let container: HTMLDivElement;
	let root: Root;
	function Probe() {
		const positions = useUserPositions();
		return <div data-loading={positions.isLoading} data-error={positions.hasError} data-stale={positions.isStale} />;
	}
	function render() {
		act(() => root.render(<Probe />));
		return container.firstElementChild;
	}
	beforeEach(() => {
		Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
		Object.assign(state, {
			clientKey: "0x1111111111111111111111111111111111111111",
			status: "active",
			data: undefined,
			isStale: false,
		});
		container = document.createElement("div");
		root = createRoot(container);
	});
	afterEach(() => act(() => root.unmount()));

	it("waits after subscription acknowledgement, then accepts a complete empty snapshot", () => {
		expect(render()?.getAttribute("data-loading")).toBe("true");
		state.data = { user: state.clientKey, clearinghouseStates: [] } as AllDexsClearinghouseStateWsEvent;
		expect(render()?.getAttribute("data-loading")).toBe("false");
	});

	it.each(["idle", "subscribing", "error"])("does not classify missing data as empty in %s", (status) => {
		state.status = status;
		expect(render()?.getAttribute("data-loading")).toBe("true");
		expect(render()?.getAttribute("data-error")).toBe(String(status === "error"));
	});

	it("preserves stale and failure signals for execution guards", () => {
		state.data = { user: state.clientKey, clearinghouseStates: [] } as AllDexsClearinghouseStateWsEvent;
		state.isStale = true;
		state.status = "error";
		expect(render()?.getAttribute("data-stale")).toBe("true");
		expect(render()?.getAttribute("data-error")).toBe("true");
	});

	it("does not mark disconnected sessions as loading", () => {
		state.clientKey = "disconnected";
		expect(render()?.getAttribute("data-loading")).toBe("false");
	});
});
