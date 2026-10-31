// @vitest-environment jsdom
import { i18n } from "@lingui/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	formatVaultCompactUsd,
	formatVaultRatio,
	formatVaultSignedUsd,
	formatVaultUsd,
} from "@/components/vaults/domain/vaults";
import { getNumberFormatters, type NumberFormatters, useNumberFormat } from "@/lib/format";

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => "en-US",
}));

const LRM = "\u200E";
const renders: NumberFormatters[] = [];

function Probe() {
	renders.push(useNumberFormat());
	return null;
}

describe("number formatters and the interface direction", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		i18n.loadAndActivate({ locale: "en", messages: {} });
		renders.length = 0;
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		act(() => root.render(<Probe />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	function current(): NumberFormatters {
		const formatters = renders.at(-1);
		if (!formatters) throw new Error("the probe did not render");
		return formatters;
	}

	it("keeps the left-to-right formatters unchanged", () => {
		const formatters = current();

		expect(formatters).toBe(getNumberFormatters());
		expect(formatters.formatNumber(-1.5, 2)).toBe("-1.50");
		expect(formatters.markLeadingSign("+1.5%")).toBe("+1.5%");
	});

	it("puts a left-to-right mark before every signed result in Arabic and nowhere else", () => {
		act(() => i18n.loadAndActivate({ locale: "ar", messages: {} }));
		const formatters = current();

		expect(formatters.formatNumber(-1.5, 2)).toBe(`${LRM}-1.50`);
		expect(formatters.formatUSD(-12)).toBe(`${LRM}-$12.00`);
		expect(formatters.formatPercent(0.125, { signDisplay: "always" })).toMatch(new RegExp(`^${LRM}\\+`, "u"));
		expect(formatters.formatDecimalString("+18.50")).toBe(`${LRM}+18.50`);
		expect(formatters.formatUSD(12)).toBe("$12.00");
		expect(formatters.formatDecimalString("not a number")).toBe("-");
		expect(formatters.markLeadingSign("+1.5%")).toBe(`${LRM}+1.5%`);
		expect(formatters.markLeadingSign(`${LRM}-1`)).toBe(`${LRM}-1`);
		expect(formatters.markLeadingSign("-")).toBe("-");
	});

	it("gives the composed vault values the same mark", () => {
		act(() => i18n.loadAndActivate({ locale: "ar", messages: {} }));
		const arabic = current();

		expect(formatVaultSignedUsd("12.5", arabic)).toBe(`${LRM}+$12.50`);
		expect(formatVaultUsd("-3", arabic)).toBe(`${LRM}-$3.00`);
		expect(formatVaultCompactUsd("-2500000", arabic)).toBe(`${LRM}-$2.5M`);
		expect(formatVaultRatio("0.1234", arabic, 2, true)).toBe(`${LRM}+12.34%`);
		expect(formatVaultSignedUsd("12.5", getNumberFormatters())).toBe("+$12.50");
	});

	it("renders again with new formatter identities when the direction changes", () => {
		const english = current();

		act(() => i18n.loadAndActivate({ locale: "ar", messages: {} }));
		const arabic = current();
		expect(arabic).not.toBe(english);
		expect(arabic.formatNumber).not.toBe(english.formatNumber);

		act(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
		expect(current()).toBe(english);
	});
});
