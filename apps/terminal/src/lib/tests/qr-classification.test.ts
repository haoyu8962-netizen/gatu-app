import { describe, expect, it } from "vitest";
import { classifyQrValue, shouldShowQrFeedback } from "../mobile-sync/qr-classification";

describe("QR classification", () => {
	it("classifies WalletConnect URIs", () => {
		expect(classifyQrValue(" wc:abc123@2?relay-protocol=irn ")).toEqual({
			type: "walletconnect",
			uri: "wc:abc123@2?relay-protocol=irn",
		});
	});

	it("classifies HypeTerminal phone-access links", () => {
		const url = "https://app.hypeterminal.com/mobile-agent-sync#ht-mobile-sync=payload";
		expect(classifyQrValue(url)).toEqual({
			type: "phoneAccessLink",
			url,
		});
	});

	it("classifies unrelated values as unsupported", () => {
		expect(classifyQrValue("https://example.com/qr")).toEqual({
			type: "unsupported",
			value: "https://example.com/qr",
		});
		expect(classifyQrValue("not a link")).toEqual({
			type: "unsupported",
			value: "not a link",
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
