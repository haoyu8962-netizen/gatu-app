// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadApiWalletCredential } from "@/components/api-wallet/api-wallet-credentials";

const PRIVATE_KEY = `0x${"11".repeat(32)}` as const;
const AGENT_ADDRESS = "0x2222222222222222222222222222222222222222" as const;

describe("API wallet credential download", () => {
	const createObjectUrl = vi.fn(() => "blob:api-wallet-test");
	const revokeObjectUrl = vi.fn();

	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal("URL", {
			...URL,
			createObjectURL: createObjectUrl,
			revokeObjectURL: revokeObjectUrl,
		});
		createObjectUrl.mockClear();
		revokeObjectUrl.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("removes its anchor and defers Blob URL revocation after a triggered download", () => {
		const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

		downloadApiWalletCredential({
			accountAddress: "0x1111111111111111111111111111111111111111",
			agentAddress: AGENT_ADDRESS,
			agentName: "grid-bot",
			privateKey: PRIVATE_KEY,
		});

		expect(click).toHaveBeenCalledOnce();
		expect(document.querySelector('a[href="blob:api-wallet-test"]')).toBeNull();
		expect(revokeObjectUrl).not.toHaveBeenCalled();
		vi.runAllTimers();
		expect(revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:api-wallet-test");
	});

	it("always revokes the sensitive Blob URL if the download trigger throws", () => {
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
			throw new Error("download blocked");
		});

		expect(() =>
			downloadApiWalletCredential({
				accountAddress: "0x1111111111111111111111111111111111111111",
				agentAddress: AGENT_ADDRESS,
				agentName: "grid-bot",
				privateKey: PRIVATE_KEY,
			}),
		).toThrow("download blocked");
		expect(document.querySelector('a[href="blob:api-wallet-test"]')).toBeNull();
		expect(revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:api-wallet-test");
	});
});
