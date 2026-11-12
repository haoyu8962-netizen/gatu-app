// @vitest-environment jsdom

import { useTradingGuard } from "@sairn/hl-react/hooks/useTradingGuard";
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const state = vi.hoisted(() => ({
	owner: "0x1111111111111111111111111111111111111111",
	ready: false,
	sessionMode: "wallet" as "wallet" | "agent-only",
	builderFeeMissing: false,
	authorize: vi.fn(),
	onAssertCurrent: undefined as undefined | (() => void),
}));

vi.mock("@sairn/hl-react/provider", () => ({
	useHyperliquid: () => ({ clientKey: state.owner, env: "Mainnet", sessionMode: state.sessionMode }),
}));
vi.mock("../../../../../packages/hl-react/src/signing/use-trading-status", () => ({
	useTradingStatus: () => ({
		isSignerReady: state.ready,
		isBuilderFeeReady: !state.builderFeeMissing,
		needsAgent: !state.ready,
		needsBuilderFee: state.builderFeeMissing,
		isSignerLoading: false,
		isBuilderFeeLoading: false,
	}),
}));
vi.mock("../../../../../packages/hl-react/src/signing/owner-signer-provider", () => ({
	useHyperliquidOwnerSigner: () => (state.onAssertCurrent ? { assertCurrent: state.onAssertCurrent } : null),
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

	let guardOptions: Parameters<typeof useTradingGuard>[0] = {};

	function Probe() {
		guard = useTradingGuard(guardOptions);
		return null;
	}
	function render() {
		act(() => root.render(createElement(Probe)));
	}

	beforeEach(() => {
		root = createRoot(document.createElement("div"));
		mounted = true;
		guardOptions = {};
		state.owner = OWNER;
		state.ready = false;
		state.sessionMode = "wallet";
		state.builderFeeMissing = false;
		state.onAssertCurrent = undefined;
		pending = deferred();
		state.authorize.mockReset().mockReturnValue(pending.promise);
		render();
	});
	afterEach(() => {
		if (mounted) act(() => root.unmount());
		onlineManager.setOnline(true);
		vi.useRealTimers();
	});

	it("never asks an Agent-only session to sign the approvals it is missing", () => {
		state.sessionMode = "agent-only";
		render();
		const action = vi.fn();

		expect(guard.needsOwnerApproval).toBe(true);
		expect(guard.needsTrading).toBe(false);
		act(() => guard.guardAction(action));
		act(() => guard.enableTrading());

		expect(state.authorize).not.toHaveBeenCalled();
		expect(action).not.toHaveBeenCalled();
	});

	it("keeps an Agent-only session out of Enable when only the builder fee is missing", async () => {
		state.sessionMode = "agent-only";
		state.ready = true;
		state.builderFeeMissing = true;
		render();
		const action = vi.fn();

		expect(guard.needsOwnerApproval).toBe(true);
		expect(guard.needsTrading).toBe(false);
		expect(guard.isReady).toBe(false);
		act(() => guard.guardAction(action));
		expect(state.authorize).not.toHaveBeenCalled();
		expect(action).not.toHaveBeenCalled();

		guardOptions = { requiresBuilderFee: false };
		render();
		expect(guard.needsOwnerApproval).toBe(false);
		await act(async () => {
			guard.guardAction(action);
			await Promise.resolve();
		});
		expect(state.authorize).not.toHaveBeenCalled();
		expect(action).toHaveBeenCalledOnce();
	});

	it("runs an Agent-only action directly once the session is ready", async () => {
		state.sessionMode = "agent-only";
		state.ready = true;
		render();
		const action = vi.fn();

		expect(guard.needsOwnerApproval).toBe(false);
		await act(async () => {
			guard.guardAction(action);
			await Promise.resolve();
		});

		expect(state.authorize).not.toHaveBeenCalled();
		expect(action).toHaveBeenCalledOnce();
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

	describe("when the approval finishes long after the click", () => {
		const resolveAfter = (ms: number) => () => new Promise<string>((resolve) => setTimeout(() => resolve(OWNER), ms));

		beforeEach(() => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
		});

		it("still runs the action when the approval finishes within 15 seconds", async () => {
			state.authorize.mockImplementation(resolveAfter(14_000));
			const action = vi.fn();
			act(() => guard.guardAction(action));
			await act(async () => {
				await vi.advanceTimersByTimeAsync(14_000);
			});
			expect(action).toHaveBeenCalledOnce();
		});

		it("hands the action back to a new click when the approval took longer", async () => {
			state.authorize.mockImplementation(resolveAfter(16_000));
			const action = vi.fn();
			act(() => guard.guardAction(action));
			await act(async () => {
				await vi.advanceTimersByTimeAsync(16_000);
			});
			expect(action).not.toHaveBeenCalled();
			expect(guard.error).toBeNull();

			state.ready = true;
			render();
			act(() => guard.guardAction(action));
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			expect(action).toHaveBeenCalledOnce();
		});

		it("does not run the action when an approval paused offline needs no signature after 120 seconds", async () => {
			const queryClient = new QueryClient();
			queryClient.mount();
			let approved = false;
			state.authorize.mockImplementation(async () => {
				const owner = await queryClient.fetchQuery({
					queryKey: ["trading-status"],
					queryFn: async () => OWNER,
					networkMode: "online",
					staleTime: 0,
				});
				approved = true;
				return owner;
			});
			onlineManager.setOnline(false);
			const action = vi.fn();
			act(() => guard.guardAction(action));
			await act(async () => {
				await vi.advanceTimersByTimeAsync(120_000);
			});
			expect(approved).toBe(false);
			await act(async () => {
				onlineManager.setOnline(true);
				await vi.advanceTimersByTimeAsync(0);
			});
			expect(state.authorize).toHaveBeenCalledOnce();
			expect(approved).toBe(true);
			expect(action).not.toHaveBeenCalled();
			expect(guard.error).toBeNull();

			state.authorize.mockImplementation(resolveAfter(1_000));
			act(() => guard.guardAction(action));
			await act(async () => {
				await vi.advanceTimersByTimeAsync(1_000);
			});
			expect(action).toHaveBeenCalledOnce();
			queryClient.unmount();
			queryClient.clear();
		});

		it("never applies the limit to an action that needs no approval", async () => {
			state.ready = true;
			state.onAssertCurrent = () => vi.setSystemTime(Date.now() + 20_000);
			render();
			const action = vi.fn();
			act(() => guard.guardAction(action));
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			expect(state.authorize).not.toHaveBeenCalled();
			expect(action).toHaveBeenCalledOnce();
		});
	});
});
