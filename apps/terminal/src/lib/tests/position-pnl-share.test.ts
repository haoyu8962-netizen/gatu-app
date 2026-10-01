// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildPositionPnlShareUrl,
	createPositionPnlShareQrDataUrl,
	downloadPositionPnlSharePng,
	type PositionPnlShareImageModel,
	type PositionPnlSharePalette,
	readPositionPnlSharePalette,
	renderPositionPnlSharePng,
	sanitizePositionPnlShareFilename,
} from "@/lib/trade/position-pnl-share";

const paletteVariables = {
	"--position-share-card": "#1a2330",
	"--position-share-fg": "#ffffff",
	"--position-share-muted": "#8fa0b0",
	"--position-share-profit": "#2fc482",
	"--position-share-loss": "#f0665e",
	"--position-share-long": "#1f8a5a",
	"--position-share-short": "#d6453d",
	"--position-share-divider": "#ffffff1f",
	"--position-share-logo-signal": "#86e5d3",
	"--position-share-logo-choice": "#e6b766",
} as const;

const palette: PositionPnlSharePalette = {
	card: "#1a2330",
	foreground: "#ffffff",
	muted: "#8fa0b0",
	profit: "#2fc482",
	loss: "#f0665e",
	long: "#1f8a5a",
	short: "#d6453d",
	divider: "#ffffff1f",
	logoSignal: "#86e5d3",
	logoChoice: "#e6b766",
};

const imageModel: PositionPnlShareImageModel = {
	timestamp: "2026-08-05 10:30",
	symbol: "BTC-PERP",
	directionLabel: "Long 10x",
	directionTone: "long",
	roeLabel: "ROE",
	roeValue: "+12.3%",
	pnlValue: "+$123.45",
	pnlTone: "profit",
	entryLabel: "Entry Price",
	entryValue: "$100,000.00",
	markLabel: "Mark Price",
	markValue: "$101,000.00",
	fontFamily: "Inter, sans-serif",
};

describe("position PNL share URL", () => {
	it("builds the target market URL from the current origin", () => {
		expect(buildPositionPnlShareUrl("https://trade.example.com/trade/BTC?tab=chart#orders", "xyz:ORCL")).toBe(
			"https://trade.example.com/trade/xyz:ORCL",
		);
		expect(buildPositionPnlShareUrl("http://127.0.0.1:3006/trade/BTC", "PURR/USDC")).toBe(
			"http://127.0.0.1:3006/trade/PURR/USDC",
		);
	});

	it("preserves only an explicit scope=all query value", () => {
		expect(
			buildPositionPnlShareUrl("https://trade.example.com/trade/BTC?account=0x123&scope=all&scope=spot#orders", "ETH"),
		).toBe("https://trade.example.com/trade/ETH?scope=all");
		expect(buildPositionPnlShareUrl("https://trade.example.com/trade/BTC?scope=spot&foo=bar", "ETH")).toBe(
			"https://trade.example.com/trade/ETH",
		);
	});

	it("rejects invalid, non-HTTP, and empty inputs", () => {
		expect(buildPositionPnlShareUrl("not a URL", "BTC")).toBeNull();
		expect(buildPositionPnlShareUrl("file:///tmp/trade.html", "BTC")).toBeNull();
		expect(buildPositionPnlShareUrl("javascript:alert(1)", "BTC")).toBeNull();
		expect(buildPositionPnlShareUrl("https://trade.example.com/trade/BTC", "   ")).toBeNull();
	});
});

describe("position PNL share filename", () => {
	it("returns a portable PNG filename", () => {
		expect(sanitizePositionPnlShareFilename(" GATU / BTC:* PNL.png ")).toBe("GATU-BTC-PNL.png");
		expect(sanitizePositionPnlShareFilename("CON")).toBe("position-CON.png");
		expect(sanitizePositionPnlShareFilename("\u0000\n")).toBe("position-pnl.png");
	});

	it("caps the filename without splitting Unicode characters", () => {
		const result = sanitizePositionPnlShareFilename("🚀".repeat(120));
		expect([...result.replace(/\.png$/, "")]).toHaveLength(96);
		expect(result.endsWith(".png")).toBe(true);
	});
});

describe("position PNL share palette", () => {
	beforeEach(() => {
		for (const [name, value] of Object.entries(paletteVariables)) {
			document.documentElement.style.setProperty(name, value);
		}
	});

	afterEach(() => {
		for (const name of Object.keys(paletteVariables)) {
			document.documentElement.style.removeProperty(name);
		}
	});

	it("reads every share-card color from CSS variables", () => {
		expect(readPositionPnlSharePalette()).toEqual(palette);
	});

	it("fails with the missing token name instead of inventing a color", () => {
		document.documentElement.style.removeProperty("--position-share-profit");
		expect(() => readPositionPnlSharePalette()).toThrow(
			"Missing position PNL share palette variable: --position-share-profit",
		);
	});
});

describe("position PNL share browser failures", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("rejects a non-HTTP QR target before loading the QR renderer", async () => {
		await expect(createPositionPnlShareQrDataUrl("file:///tmp/share", palette)).rejects.toThrow(
			"Cannot create a QR code for a non-HTTP share URL",
		);
		await expect(createPositionPnlShareQrDataUrl("not a URL", palette)).rejects.toThrow(
			"Cannot create a QR code for an invalid share URL",
		);
	});

	it("fails predictably when Canvas 2D rendering is unavailable", async () => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
		await expect(renderPositionPnlSharePng(imageModel, palette, "data:image/png;base64,AA==")).rejects.toThrow(
			"Canvas rendering is unavailable",
		);
	});

	it("sanitizes the filename used by the browser download", () => {
		let downloadedFilename = "";
		const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
			downloadedFilename = this.download;
		});
		const createObjectUrl = vi.fn(() => "blob:position-pnl");
		const revokeObjectUrl = vi.fn();
		const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
		const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
		Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
		Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
		vi.useFakeTimers();

		try {
			downloadPositionPnlSharePng(new Blob(["png"], { type: "image/png" }), "GATU/BTC?.png");

			expect(click).toHaveBeenCalledOnce();
			expect(downloadedFilename).toBe("GATU-BTC.png");
			expect(createObjectUrl).toHaveBeenCalledOnce();
			expect(document.querySelector("a[download]")).toBeNull();
			vi.runAllTimers();
			expect(revokeObjectUrl).toHaveBeenCalledWith("blob:position-pnl");
		} finally {
			restoreProperty(URL, "createObjectURL", createObjectUrlDescriptor);
			restoreProperty(URL, "revokeObjectURL", revokeObjectUrlDescriptor);
		}
	});
});

function restoreProperty(
	target: typeof URL,
	key: "createObjectURL" | "revokeObjectURL",
	descriptor?: PropertyDescriptor,
) {
	if (descriptor) Object.defineProperty(target, key, descriptor);
	else Reflect.deleteProperty(target, key);
}
