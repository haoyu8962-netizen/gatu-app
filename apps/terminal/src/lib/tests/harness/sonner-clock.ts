import { act } from "react";
import { vi } from "vitest";

/**
 * Drives the real Sonner under fake timers. Sonner inserts a toast from a timer and removes one
 * through two animation frames, so a test can run either side first and reproduce the orders a
 * browser may pick.
 */
export function installSonnerClock() {
	let frameId = 0;
	const frames = new Map<number, FrameRequestCallback>();
	vi.useFakeTimers();
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		const id = ++frameId;
		frames.set(id, callback);
		return id;
	});
	vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));

	async function runFrames() {
		await act(async () => {
			const pending = [...frames.values()];
			frames.clear();
			for (const callback of pending) callback(performance.now());
		});
	}

	async function timers(milliseconds = 1) {
		await act(() => vi.advanceTimersByTimeAsync(milliseconds));
	}

	async function settle() {
		await timers();
		await runFrames();
		await runFrames();
		await timers(500);
		await runFrames();
		await runFrames();
		await timers(500);
	}

	function uninstall() {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	}

	return { runFrames, timers, settle, uninstall };
}
