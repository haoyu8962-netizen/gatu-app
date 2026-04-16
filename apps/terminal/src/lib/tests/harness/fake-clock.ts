import { vi } from "vitest";

export function useFakeClock() {
	function install() {
		vi.useFakeTimers();
	}

	function uninstall() {
		vi.useRealTimers();
	}

	async function advance(ms: number) {
		await vi.advanceTimersByTimeAsync(ms);
	}

	function advanceSync(ms: number) {
		vi.advanceTimersByTime(ms);
	}

	async function flush() {
		await vi.runAllTimersAsync();
	}

	function now() {
		return Date.now();
	}

	return { install, uninstall, advance, advanceSync, flush, now };
}
