import { describe, expect, it } from "vitest";
import { isSafeReferralJoinCode, parseReferralJoinPath, resolveReferralJoinIntent } from "@/lib/trade/referral-join";

describe("referral join links", () => {
	it("resolves canonical hosts to immutable Hyperliquid environments", () => {
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "https://app.sairn.ai")).toEqual({
			code: "sairnappweb3",
			env: "Mainnet",
		});
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "https://testnet.sairn.ai")).toEqual({
			code: "sairnappweb3",
			env: "Testnet",
		});
	});

	it("keeps referral links working on the legacy gatu.ai hosts", () => {
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "https://app.gatu.ai")).toEqual({
			code: "sairnappweb3",
			env: "Mainnet",
		});
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "https://testnet.gatu.ai")).toEqual({
			code: "sairnappweb3",
			env: "Testnet",
		});
	});

	it("rejects unknown and hostname-confusion origins", () => {
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "https://app.sairn.ai.evil.example")).toBeNull();
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "https://preview.sairn.ai")).toBeNull();
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "http://app.sairn.ai")).toBeNull();
		expect(resolveReferralJoinIntent("/join/sairnappweb3", "https://app.sairn.ai:8443")).toBeNull();
	});

	it("round-trips exact case, spaces, and Unicode once", () => {
		expect(parseReferralJoinPath("/join/Sairn%20Code")).toBe("Sairn Code");
		expect(parseReferralJoinPath(`/join/${encodeURIComponent("邀请")}`)).toBe("邀请");
	});

	it("accepts equivalent percent-encoding without changing the decoded code", () => {
		expect(parseReferralJoinPath("/join/%73airnappweb3")).toBe("sairnappweb3");
		expect(parseReferralJoinPath("/join/%e9%82%80%e8%af%b7")).toBe("邀请");
	});

	it.each([
		"/join",
		"/join/",
		"/join/code/extra",
		"/join/%2F",
		"/join/%5C",
		"/join/%252F",
		"/join/%00",
		"/join/%2e%2e",
		"/join/%",
	])("rejects unsafe or malformed path %s", (pathname) => {
		expect(parseReferralJoinPath(pathname)).toBeNull();
	});

	it("enforces the SDK length contract without mutating safe codes", () => {
		expect(isSafeReferralJoinCode("A")).toBe(true);
		expect(isSafeReferralJoinCode("x".repeat(20))).toBe(true);
		expect(isSafeReferralJoinCode("x".repeat(21))).toBe(false);
		expect(isSafeReferralJoinCode("Code With Space")).toBe(true);
	});
});
