// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotFoundPage } from "@/components/pages/not-found-page";
import { SEO_DEFAULTS } from "@/config/seo";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

describe("not found page", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("uses one main landmark and keeps the recovery link named", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<NotFoundPage />
				</I18nProvider>,
			),
		);

		expect(container.querySelectorAll("main")).toHaveLength(1);
		const link = container.querySelector<HTMLAnchorElement>('a[href="/"]');
		expect(link?.getAttribute("aria-label")).toBe("Go to trading terminal");
		expect(link?.textContent).toContain("Go to trading terminal");
	});

	it("names the document after the missing page while mounted, whichever route renders it", () => {
		document.title = "0.1 BTC/USDC · Sairn";
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<NotFoundPage />
				</I18nProvider>,
			),
		);

		expect(document.title).toBe(`Page Not Found | ${SEO_DEFAULTS.siteName}`);

		act(() => root.render(null));

		expect(document.title).toBe("0.1 BTC/USDC · Sairn");
	});

	it("leaves a title that the next route already installed alone", () => {
		document.title = "0.1 BTC/USDC · Sairn";
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<NotFoundPage />
				</I18nProvider>,
			),
		);
		document.title = "Portfolio | Sairn";

		act(() => root.render(null));

		expect(document.title).toBe("Portfolio | Sairn");
	});

	it("updates its visible and accessible recovery copy after a locale switch", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<NotFoundPage />
				</I18nProvider>,
			),
		);

		act(() => {
			i18n.loadAndActivate({
				locale: "zh",
				messages: {
					[getMessageId("Go to trading terminal")]: "前往交易终端",
				},
			});
		});

		const link = container.querySelector<HTMLAnchorElement>('a[href="/"]');
		expect(link?.getAttribute("aria-label")).toBe("前往交易终端");
		expect(link?.textContent).toContain("前往交易终端");
	});
});
