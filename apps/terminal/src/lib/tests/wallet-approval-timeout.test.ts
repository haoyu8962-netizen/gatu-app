// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withWalletApprovalTimeout } from "../../../../../packages/hl-react/src/signing/wallet-approval-timeout";

function deferred<T>() {
	let resolve = (_value: T) => {};
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function setDocumentHidden(hidden: boolean) {
	Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
	document.dispatchEvent(new Event("visibilitychange"));
}

describe("wallet approval timeout", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: 0 });
		Object.defineProperty(document, "hidden", { configurable: true, value: false });
	});

	afterEach(() => {
		Object.defineProperty(document, "hidden", { configurable: true, value: false });
		vi.useRealTimers();
	});

	it("times out after 60 seconds of foreground waiting", async () => {
		const approval = deferred<void>();
		const result = withWalletApprovalTimeout(approval.promise);
		const expectation = expect(result).rejects.toThrow("Wallet approval timed out");

		await vi.advanceTimersByTimeAsync(60_000);

		await expectation;
	});

	it("does not count time spent in a mobile wallet app", async () => {
		const approval = deferred<void>();
		const result = withWalletApprovalTimeout(approval.promise);

		await vi.advanceTimersByTimeAsync(25_000);
		setDocumentHidden(true);
		await vi.advanceTimersByTimeAsync(120_000);

		let settled = false;
		void result.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			},
		);
		await Promise.resolve();
		expect(settled).toBe(false);

		setDocumentHidden(false);
		await vi.advanceTimersByTimeAsync(34_999);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await expect(result).rejects.toThrow("Wallet approval timed out");
	});

	it("resolves while the page is hidden and removes lifecycle listeners", async () => {
		const approval = deferred<string>();
		const removeDocumentListener = vi.spyOn(document, "removeEventListener");
		const removeWindowListener = vi.spyOn(window, "removeEventListener");
		const result = withWalletApprovalTimeout(approval.promise);

		setDocumentHidden(true);
		approval.resolve("approved");

		await expect(result).resolves.toBe("approved");
		expect(removeDocumentListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
		expect(removeWindowListener).toHaveBeenCalledWith("pagehide", expect.any(Function));
		expect(removeWindowListener).toHaveBeenCalledWith("pageshow", expect.any(Function));
	});
});
