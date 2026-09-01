// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MobileTradingApprovalErrorMessage } from "@/components/trade/mobile/mobile-trade-view";

const APPROVAL_FAILURE = "Failed to enable trading";
const ARABIC_APPROVAL_FAILURE = "تعذر تمكين التداول";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(APPROVAL_FAILURE)]: ARABIC_APPROVAL_FAILURE,
};

function ErrorProbe({ cause }: { cause: unknown }) {
	const [storedCause] = useState(cause);
	return <MobileTradingApprovalErrorMessage cause={storedCause} />;
}

describe("MobileTradingApprovalErrorMessage", () => {
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

	it("retranslates a stored fallback cause when the locale changes", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<ErrorProbe cause={undefined} />
				</I18nProvider>,
			),
		);
		expect(container.textContent).toBe(APPROVAL_FAILURE);

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.textContent).toBe(ARABIC_APPROVAL_FAILURE);
	});

	it("preserves an external error message verbatim", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<ErrorProbe cause={new Error("Wallet rejected request")} />
				</I18nProvider>,
			),
		);
		expect(container.textContent).toBe("Wallet rejected request");

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.textContent).toBe("Wallet rejected request");
	});
});
