import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WalletCtaView } from "@/components/trade/header/wallet-cta-view";
import { ctaConnect, ctaConnectDark } from "@/components/trade/mobile/mobile-trade-cta-frame-view";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_THEME_CSS = readFileSync(resolve(TEST_DIR, "../..", "styles.css"), "utf8");

function readWalletCtaTokens(): string[] {
	const markup = renderToStaticMarkup(<WalletCtaView label="Connect Wallet" />);
	return /class="([^"]*)"/.exec(markup)?.[1]?.split(/\s+/) ?? [];
}

function readCssVariable(selector: string, variable: string): string | undefined {
	const selectorStart = TERMINAL_THEME_CSS.indexOf(`${selector} {`);
	if (selectorStart === -1) return undefined;
	const blockStart = TERMINAL_THEME_CSS.indexOf("{", selectorStart);
	const blockEnd = TERMINAL_THEME_CSS.indexOf("}", blockStart);
	const declaration = new RegExp(`${variable}:\\s*([^;]+);`).exec(TERMINAL_THEME_CSS.slice(blockStart + 1, blockEnd));
	return declaration?.[1]?.trim();
}

function readFillToken(classes: string, prefix: string): string {
	const token = classes.split(/\s+/).find((candidate) => candidate.startsWith(prefix));
	const fill = token?.slice(prefix.length);
	if (!fill) throw new Error(`No ${prefix}* class in: ${classes}`);
	return fill;
}

describe("connect call-to-action states", () => {
	it("moves the header button through the action tokens without fading the whole button", () => {
		const tokens = readWalletCtaTokens();

		expect(tokens).toContain("bg-action");
		expect(tokens).toContain("text-on-action");
		expect(tokens).toContain("hover:not-data-disabled:bg-action-hover");
		expect(tokens).toContain("active:not-data-disabled:bg-action-active");
		expect(tokens.filter((token) => token.includes("opacity"))).toEqual([]);
	});

	it("animates every property the header button changes on hover and press", () => {
		const tokens = readWalletCtaTokens();

		expect(tokens).toContain("transition-[color,background-color,border-color,scale]");
		expect(tokens).toContain("active:not-data-disabled:scale-[0.97]");
		expect(tokens).toContain("motion-reduce:transition-none");
	});

	it("declares one radius and no shadow on the header button", () => {
		const tokens = readWalletCtaTokens();

		expect(tokens.filter((token) => /^!?rounded-/.test(token))).toEqual(["rounded-20"]);
		expect(tokens.filter((token) => /^!?shadow-/.test(token))).toEqual([]);
		expect(tokens.filter((token) => /^text-\[/.test(token))).toEqual([]);
	});

	it("gives the order-form connect button a visible hover step in both themes", () => {
		expect(ctaConnect).toContain("bg-trading-panel-control ");
		expect(ctaConnect).toContain("hover:not-data-disabled:bg-trading-panel-control/90");

		const restFill = readFillToken(ctaConnectDark, "dark:bg-");
		const hoverFill = readFillToken(ctaConnectDark, "dark:hover:not-data-disabled:bg-");
		const restValue = readCssVariable(".dark", `--${restFill}`);
		const hoverValue = readCssVariable(".dark", `--${hoverFill}`);

		expect(restValue).toBe("#ffffff0f");
		expect(hoverValue).toBe("#ffffff1f");
		expect(hoverValue).not.toBe(restValue);
	});
});
