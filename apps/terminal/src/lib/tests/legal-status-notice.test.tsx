// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LegalStatusNotice } from "@/components/trade/components/legal-status-notice";

describe("LegalStatusNotice", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("only renders while legal access is being checked", () => {
		act(() =>
			root.render(
				createElement(
					I18nProvider,
					{
						i18n,
					},
					createElement(LegalStatusNotice, { state: "checking" }),
				),
			),
		);

		const notice = container.querySelector('[data-slot="legal-status-notice"]');
		expect(notice).not.toBeNull();
		expect(notice?.getAttribute("aria-live")).toBe("polite");
		expect(notice?.textContent).toContain("Verifying trading access");

		act(() =>
			root.render(
				createElement(
					I18nProvider,
					{
						i18n,
					},
					createElement(LegalStatusNotice, { state: "accepted" }),
				),
			),
		);
		expect(container.querySelector('[data-slot="legal-status-notice"]')).toBeNull();
	});
});
