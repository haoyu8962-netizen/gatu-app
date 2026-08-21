import { describe, expect, it } from "vitest";
import { resolveAgentRegistrationStorageScope } from "@/lib/hyperliquid";

describe("Agent registration storage defaults", () => {
	it("keeps Stay Connected off unless persistence is explicitly enabled", () => {
		expect(resolveAgentRegistrationStorageScope()).toBe("session");
		expect(resolveAgentRegistrationStorageScope({})).toBe("session");
		expect(resolveAgentRegistrationStorageScope({ persistConnection: false })).toBe("session");
		expect(resolveAgentRegistrationStorageScope({ persistConnection: true })).toBe("local");
	});
});
