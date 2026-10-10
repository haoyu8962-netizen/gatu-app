// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

vi.mock("qr-scanner", () => {
	throw new Error("Failed to fetch dynamically imported module");
});

import { QrScannerLoadError, startBrowserQrScanner } from "@/components/trade/components/mobile-agent-qr-scanner";

describe("startBrowserQrScanner", () => {
	it("reports a scanner module that cannot load as a load failure, not as a camera problem", async () => {
		const video = document.createElement("video");

		await expect(startBrowserQrScanner(video, vi.fn())).rejects.toBeInstanceOf(QrScannerLoadError);
	});
});
