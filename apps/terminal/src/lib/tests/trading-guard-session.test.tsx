// @vitest-environment jsdom

import { useTradingGuard } from "@sairn/hl-react/hooks/useTradingGuard";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const state = vi.hoisted(() => ({
	owner: "0x1111111111111111111111111111111111111111",
	ready: false,
	authorize: vi.fn(),
}));

vi.mock("@sairn/hl-react/provider", () => ({
	useHyperliquid: () => ({ clientKey: state.owner, env: "Mainnet", sessionMode: "wallet" }),
}));
vi.mock("../../../../../packages/hl-react/src/signing/use-trading-status", () => ({
	useTradingStatus: () => ({
		isSignerReady: state.ready,
		isBuilderFeeReady: true,
		needsAgent: !state.ready,
		needsBuilderFee: false,
		isSignerLoading: false,
		isBuilderFeeLoading: false,
	}),
}));
vi.mock("@sairn/hl-react/signing/use-trading-authorization", () => ({
	useTradingAuthorization: () => ({ authorize: state.authorize, status: "idle", error: null }),
}));

function deferred() {
	let resolve = (_value: string) => {};
	let reject = (_error: Error) => {};
	const promise = new Promise<string>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

describe("explicit trading actions stay bound to the initiating session", () => {
	let root: Root;
	let guard: ReturnType<typeof useTradingGuard>;
	let pending: ReturnType<typeof deferred>;
	let mounted: boolean;

	function Probe() {
		guard = useTradingGuard();
		return null;
	}
	function render() {
		act(() => root.render(createElement(Probe)));
	}

	beforeEach(() => {
		root = createRoot(document.createElement("div"));
		mounted = true;
		state.owner = OWNER;
		state.ready = false;
		pending = deferred();
		state.authorize.mockReset().mockReturnValue(pending.promise);
		render();
	});
	afterEach(() => {
		if (mounted) act(() => root.unmount());
	});

	it("does not execute merely because a login restore changes readiness", async () => {
		const action = vi.fn();
		act(() => guard.guardAction(action));
		state.ready = true;
		render();
		expect(action).not.toHaveBeenCalled();
		await act(async () => {
			pending.resolve(OWNER);
			await pending.promise;
		});
		expect(action).toHaveBeenCalledOnce();
		state.ready = false;
		render();
		state.ready = true;
		render();
		expect(action).toHaveBeenCalledOnce();
	});

	it("does not revive a failed action after readiness recovers", async () => {
		const action = vi.fn();
		act(() => guard.guardAction(action));
		await act(async () => {
			pending.reject(new Error("Approval failed"));
			await pending.promise.catch(() => {});
		});
		state.ready = true;
		render();
		expect(action).not.toHaveBeenCalled();
		expect(guard.error?.message).toBe("Approval failed");
	});

	it("invalidates an action through an A to B to A owner switch", async () => {
		const action = vi.fn();
		act(() => guard.guardAction(action));
		state.owner = OTHER;
		render();
		state.owner = OWNER;
		render();
		await act(async () => {
			pending.resolve(OWNER);
			await pending.promise;
		});
		expect(action).not.toHaveBeenCalled();
	});

	it("does not execute after unmount even when approval eventually completes", async () => {
		const action = vi.fn();
		act(() => guard.guardAction(action));
		act(() => root.unmount());
		mounted = false;
		await act(async () => {
			pending.resolve(OWNER);
			await pending.promise;
		});
		expect(action).not.toHaveBeenCalled();
	});

	it("only authorizes once while an explicit request is in flight", async () => {
		const action = vi.fn();
		act(() => {
			guard.guardAction(action);
			guard.guardAction(action);
		});
		expect(state.authorize).toHaveBeenCalledOnce();
		await act(async () => {
			pending.resolve(OWNER);
			await pending.promise;
		});
		expect(action).toHaveBeenCalledOnce();
	});

	it("enabling alone never retains an action for a later render", async () => {
		act(() => guard.enableTrading());
		await act(async () => {
			pending.resolve(OWNER);
			await pending.promise;
		});
		state.ready = true;
		render();
		expect(state.authorize).toHaveBeenCalledOnce();
		expect(guard.isReady).toBe(true);
	});
});
