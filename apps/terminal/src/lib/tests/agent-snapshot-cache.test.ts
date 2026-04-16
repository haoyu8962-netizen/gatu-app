import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("window", {
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
	dispatchEvent: vi.fn(),
});

vi.stubGlobal("localStorage", {
	getItem: vi.fn(),
	setItem: vi.fn(),
	removeItem: vi.fn(),
});

describe("agent snapshot cache", () => {
	const VALID_PRIVATE_KEY = `0x${"ab".repeat(32)}` as const;
	const VALID_PUBLIC_KEY = `0x${"cd".repeat(20)}` as const;
	const STORAGE_VALUE = JSON.stringify({ privateKey: VALID_PRIVATE_KEY, publicKey: VALID_PUBLIC_KEY });

	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns same reference for repeated reads without storage change", async () => {
		vi.mocked(localStorage.getItem).mockReturnValue(STORAGE_VALUE);

		const { readAgentFromStorage } = await import("@hypeterminal/hl-react/signing/agent-storage");

		const first = readAgentFromStorage("Mainnet", "0x1234");
		const second = readAgentFromStorage("Mainnet", "0x1234");

		expect(first).toEqual(second);
		expect(first).not.toBeNull();
	});

	it("returns null when localStorage is empty", async () => {
		vi.mocked(localStorage.getItem).mockReturnValue(null);

		const { readAgentFromStorage } = await import("@hypeterminal/hl-react/signing/agent-storage");

		expect(readAgentFromStorage("Mainnet", "0x1234")).toBeNull();
	});

	it("returns null for invalid storage data", async () => {
		vi.mocked(localStorage.getItem).mockReturnValue("not-json");

		const { readAgentFromStorage } = await import("@hypeterminal/hl-react/signing/agent-storage");

		expect(readAgentFromStorage("Mainnet", "0x1234")).toBeNull();
	});
});
