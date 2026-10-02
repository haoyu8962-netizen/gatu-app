import { BRAND_LOGO_GEOMETRY } from "@/lib/brand/logo-geometry.gen";
import { getTradePathForMarketName } from "@/lib/hyperliquid/market-route";

const CARD_WIDTH = 360;
const CARD_HEIGHT = 260;
const EXPORT_SCALE = 2;
const QR_SIZE = 44;
// The logo kit allows the lockup from 24 px high.
const BRAND_LOCKUP = { x: 26, y: 18, height: 24 } as const;

const paletteVariables = {
	card: "--position-share-card",
	foreground: "--position-share-fg",
	muted: "--position-share-muted",
	profit: "--position-share-profit",
	loss: "--position-share-loss",
	long: "--position-share-long",
	short: "--position-share-short",
	divider: "--position-share-divider",
	logoSignal: "--position-share-logo-signal",
	logoChoice: "--position-share-logo-choice",
} as const;

export interface PositionPnlSharePalette {
	card: string;
	foreground: string;
	muted: string;
	profit: string;
	loss: string;
	long: string;
	short: string;
	divider: string;
	logoSignal: string;
	logoChoice: string;
}

export interface PositionPnlShareImageModel {
	timestamp: string;
	symbol: string;
	directionLabel: string;
	directionTone: "long" | "short";
	roeLabel: string;
	roeValue: string;
	pnlValue: string;
	pnlTone: "profit" | "loss";
	entryLabel: string;
	entryValue: string;
	markLabel: string;
	markValue: string;
	networkLabel?: string;
	fontFamily: string;
}

export function buildPositionPnlShareUrl(currentHref: string, marketName: string): string | null {
	const normalizedMarketName = marketName.trim();
	if (!normalizedMarketName) return null;

	let currentUrl: URL;
	try {
		currentUrl = new URL(currentHref);
	} catch {
		return null;
	}

	if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") return null;

	const shareUrl = new URL(getTradePathForMarketName(normalizedMarketName), currentUrl.origin);
	if (currentUrl.searchParams.getAll("scope").includes("all")) {
		shareUrl.searchParams.set("scope", "all");
	}
	return shareUrl.href;
}

export function sanitizePositionPnlShareFilename(filename: string): string {
	const normalized = filename
		.normalize("NFKC")
		.trim()
		.replace(/\.png$/i, "");
	const withoutControls = [...normalized]
		.map((character) => {
			const codePoint = character.codePointAt(0);
			return codePoint !== undefined && (codePoint <= 31 || codePoint === 127) ? "-" : character;
		})
		.join("");
	const sanitized = withoutControls
		.replace(/[<>:"/\\|?*]+/g, "-")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[.\s-]+|[.\s-]+$/g, "");
	const truncated = [...sanitized].slice(0, 96).join("");
	const safeBase = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(truncated)
		? `position-${truncated}`
		: truncated || "position-pnl";
	return `${safeBase}.png`;
}

export function readPositionPnlSharePalette(root?: Element): PositionPnlSharePalette {
	if (typeof document === "undefined" || typeof getComputedStyle === "undefined") {
		throw new Error("Position PNL share palette is only available in a browser");
	}

	const styles = getComputedStyle(root ?? document.documentElement);
	const readVariable = (variable: string) => {
		const value = styles.getPropertyValue(variable).trim();
		if (!value) throw new Error(`Missing position PNL share palette variable: ${variable}`);
		return value;
	};
	return {
		card: readVariable(paletteVariables.card),
		foreground: readVariable(paletteVariables.foreground),
		muted: readVariable(paletteVariables.muted),
		profit: readVariable(paletteVariables.profit),
		loss: readVariable(paletteVariables.loss),
		long: readVariable(paletteVariables.long),
		short: readVariable(paletteVariables.short),
		divider: readVariable(paletteVariables.divider),
		logoSignal: readVariable(paletteVariables.logoSignal),
		logoChoice: readVariable(paletteVariables.logoChoice),
	};
}

export async function createPositionPnlShareQrDataUrl(
	shareUrl: string,
	palette: PositionPnlSharePalette,
): Promise<string> {
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(shareUrl);
	} catch {
		throw new Error("Cannot create a QR code for an invalid share URL");
	}
	if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
		throw new Error("Cannot create a QR code for a non-HTTP share URL");
	}

	const QRCode = await import("qrcode");
	return QRCode.toDataURL(parsedUrl.href, {
		errorCorrectionLevel: "M",
		margin: 1,
		width: QR_SIZE * EXPORT_SCALE,
		color: {
			dark: palette.card,
			light: palette.foreground,
		},
	});
}

export async function renderPositionPnlSharePng(
	model: PositionPnlShareImageModel,
	palette: PositionPnlSharePalette,
	qrDataUrl: string | null,
): Promise<Blob> {
	if (typeof document === "undefined") {
		throw new Error("Position PNL share images can only be rendered in a browser");
	}

	const canvas = document.createElement("canvas");
	canvas.width = CARD_WIDTH * EXPORT_SCALE;
	canvas.height = CARD_HEIGHT * EXPORT_SCALE;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas rendering is unavailable");
	await document.fonts?.ready;

	context.scale(EXPORT_SCALE, EXPORT_SCALE);
	context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
	drawRoundedRect(context, 0, 0, CARD_WIDTH, CARD_HEIGHT, 16, palette.card);
	drawShareCardContent(context, model, palette);

	if (qrDataUrl) {
		const qrImage = await loadImage(qrDataUrl);
		context.drawImage(qrImage, 290, 194, QR_SIZE, QR_SIZE);
	} else if (model.networkLabel) {
		drawNetworkBadge(context, model.networkLabel, palette);
	}

	return canvasToPngBlob(canvas);
}

export function downloadPositionPnlSharePng(blob: Blob, filename: string): void {
	if (typeof document === "undefined") {
		throw new Error("Position PNL share images can only be downloaded in a browser");
	}

	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = objectUrl;
	anchor.download = sanitizePositionPnlShareFilename(filename);
	anchor.hidden = true;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function sharePositionPnlPng(blob: Blob, filename: string): Promise<boolean> {
	if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof File === "undefined") {
		return false;
	}
	const file = new File([blob], sanitizePositionPnlShareFilename(filename), { type: "image/png" });
	if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) return false;
	await navigator.share({ files: [file] });
	return true;
}

function drawShareCardContent(
	context: CanvasRenderingContext2D,
	model: PositionPnlShareImageModel,
	palette: PositionPnlSharePalette,
): void {
	context.textBaseline = "alphabetic";
	drawBrandLockup(context, palette);

	context.textAlign = "right";
	context.fillStyle = palette.muted;
	setFont(context, 400, 11, model.fontFamily);
	context.fillText(fitText(context, model.timestamp, 132), 334, 37);

	context.textAlign = "left";
	context.fillStyle = palette.foreground;
	setFont(context, 700, 16, model.fontFamily);
	const symbol = fitText(context, model.symbol, 214);
	context.fillText(symbol, 26, 69);
	const symbolWidth = context.measureText(symbol).width;
	drawDirectionBadge(context, model, palette, Math.min(26 + symbolWidth + 8, 252), 52);

	context.fillStyle = palette.muted;
	setFont(context, 500, 11, model.fontFamily);
	context.fillText(fitText(context, model.roeLabel, 308), 26, 98);

	context.fillStyle = palette[model.pnlTone];
	setFont(context, 700, 40, model.fontFamily);
	context.fillText(fitText(context, model.roeValue, 308), 26, 140);
	setFont(context, 600, 14, model.fontFamily);
	context.fillText(fitText(context, model.pnlValue, 308), 26, 163);

	context.fillStyle = palette.divider;
	context.fillRect(26, 181, 308, 1);

	drawPriceField(context, model.entryLabel, model.entryValue, 26, model.fontFamily, palette);
	drawPriceField(context, model.markLabel, model.markValue, 144, model.fontFamily, palette);
}

function drawBrandLockup(context: CanvasRenderingContext2D, palette: PositionPnlSharePalette): void {
	const { viewBox, paths } = BRAND_LOGO_GEOMETRY.lockup;
	const [minX, minY, , height] = viewBox.split(" ").map(Number);
	const scale = BRAND_LOCKUP.height / height;
	const fills = { signal: palette.logoSignal, choice: palette.logoChoice, wordmark: palette.foreground };
	context.save();
	context.translate(BRAND_LOCKUP.x - minX * scale, BRAND_LOCKUP.y - minY * scale);
	context.scale(scale, scale);
	for (const path of paths) {
		context.fillStyle = fills[path.part];
		context.fill(new Path2D(path.d));
	}
	context.restore();
}

function drawDirectionBadge(
	context: CanvasRenderingContext2D,
	model: PositionPnlShareImageModel,
	palette: PositionPnlSharePalette,
	x: number,
	y: number,
): void {
	const color = palette[model.directionTone];
	setFont(context, 700, 11, model.fontFamily);
	const label = fitText(context, model.directionLabel, 65);
	const width = Math.ceil(context.measureText(label).width) + 16;
	drawRoundedRect(context, x, y, width, 18, 4, color);
	context.fillStyle = palette.foreground;
	context.fillText(label, x + 8, y + 13);
}

function drawPriceField(
	context: CanvasRenderingContext2D,
	label: string,
	value: string,
	x: number,
	fontFamily: string,
	palette: PositionPnlSharePalette,
): void {
	context.textAlign = "left";
	context.fillStyle = palette.muted;
	setFont(context, 500, 10, fontFamily);
	context.fillText(fitText(context, label, 102), x, 203);
	context.fillStyle = palette.foreground;
	setFont(context, 600, 13, fontFamily);
	context.fillText(fitText(context, value, 102), x, 224);
}

function drawNetworkBadge(context: CanvasRenderingContext2D, label: string, palette: PositionPnlSharePalette): void {
	drawRoundedRect(context, 290, 194, QR_SIZE, QR_SIZE, 6, palette.foreground);
	context.textAlign = "center";
	context.fillStyle = palette.card;
	setFont(context, 700, 8, "sans-serif");
	context.fillText(fitText(context, label, QR_SIZE - 8), 290 + QR_SIZE / 2, 220);
}

function drawRoundedRect(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
	color: string,
): void {
	const safeRadius = Math.min(radius, width / 2, height / 2);
	context.beginPath();
	context.moveTo(x + safeRadius, y);
	context.lineTo(x + width - safeRadius, y);
	context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
	context.lineTo(x + width, y + height - safeRadius);
	context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
	context.lineTo(x + safeRadius, y + height);
	context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
	context.lineTo(x, y + safeRadius);
	context.quadraticCurveTo(x, y, x + safeRadius, y);
	context.closePath();
	context.fillStyle = color;
	context.fill();
}

function setFont(context: CanvasRenderingContext2D, weight: number, size: number, fontFamily: string): void {
	context.font = `${weight} ${size}px ${fontFamily}`;
}

function fitText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string {
	if (context.measureText(value).width <= maxWidth) return value;
	const characters = [...value];
	while (characters.length > 0) {
		characters.pop();
		const candidate = `${characters.join("")}…`;
		if (context.measureText(candidate).width <= maxWidth) return candidate;
	}
	return "";
}

function loadImage(source: string): Promise<HTMLImageElement> {
	if (!source.startsWith("data:image/png;base64,")) {
		return Promise.reject(new Error("QR image data is unavailable"));
	}
	if (typeof Image === "undefined") return Promise.reject(new Error("Image rendering is unavailable"));

	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("Failed to load the QR image"));
		image.src = source;
	});
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	if (typeof canvas.toBlob !== "function") {
		return Promise.reject(new Error("PNG export is unavailable"));
	}

	return new Promise((resolve, reject) => {
		try {
			canvas.toBlob((blob) => {
				if (blob) resolve(blob);
				else reject(new Error("Failed to encode the position PNL share image"));
			}, "image/png");
		} catch {
			reject(new Error("Failed to encode the position PNL share image"));
		}
	});
}
