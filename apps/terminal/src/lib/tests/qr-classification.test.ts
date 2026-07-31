import { describe, expect, it } from "vitest";
import { classifyQrValue, shouldShowQrFeedback } from "../mobile-sync/qr-classification";

describe("QR classification", () => {
	it("classifies WalletConnect URIs", () => {
		expect(classifyQrValue(" wc:abc123@2?relay-protocol=irn ")).toEqual({
			type: "walletconnect",
			uri: "wc:abc123@2?relay-protocol=irn",
		});
	});

	it("classifies gatu phone-access links", () => {
		const origin = "https://app.hypeterminal.com";
		const url = `${origin}/mobile-agent-sync#ht-mobile-sync=payload&k=key`;
		expect(classifyQrValue(url, origin)).toEqual({
			type: "phoneAccessLink",
			url,
		});
	});

	it("rejects cross-origin, wrong-path, and incomplete phone-access links", () => {
		const origin = "https://app.hypeterminal.com";
		for (const value of [
			"https://evil.example/mobile-agent-sync#ht-mobile-sync=payload&k=key",
			`${origin}/trade#ht-mobile-sync=payload&k=key`,
			`${origin}/mobile-agent-sync#ht-mobile-sync=payload`,
		]) {
			expect(classifyQrValue(value, origin)).toEqual({
				type: "unsupported",
			});
		}
	});

	it("classifies unrelated values as unsupported without exposing them as a supported link", () => {
		expect(classifyQrValue("https://example.com/qr")).toEqual({
			type: "unsupported",
		});
		expect(classifyQrValue("not a link")).toEqual({
			type: "unsupported",
		});
	});

	it("throttles repeated wrong-QR feedback without blocking new messages", () => {
		const lastFeedback = { message: "This is not a WalletConnect QR code.", atMs: 1000 };
		const throttleMs = 1800;

		expect(shouldShowQrFeedback(null, lastFeedback.message, 1000, throttleMs)).toBe(true);
		expect(shouldShowQrFeedback(lastFeedback, lastFeedback.message, 2799, throttleMs)).toBe(false);
		expect(shouldShowQrFeedback(lastFeedback, "This is a phone-access QR.", 1100, throttleMs)).toBe(true);
		expect(shouldShowQrFeedback(lastFeedback, lastFeedback.message, 2800, throttleMs)).toBe(true);
	});
});
