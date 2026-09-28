// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { ApiRequestError } from "@nktkas/hyperliquid";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MobileTradingApprovalErrorMessage } from "@/components/trade/mobile/mobile-trade-view";

const APPROVAL_FAILURE = "Failed to enable trading";
const ARABIC_APPROVAL_FAILURE = "تعذر تمكين التداول";
const GENERIC_FAILURE = "The request could not be completed. Try again.";
const ARABIC_GENERIC_FAILURE = "تعذر إكمال الطلب. حاول مرة أخرى.";
const WALLET_REJECTED = "Transaction was rejected";
const ARABIC_WALLET_REJECTED = "تم رفض المعاملة";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(APPROVAL_FAILURE)]: ARABIC_APPROVAL_FAILURE,
	[getMessageId(GENERIC_FAILURE)]: ARABIC_GENERIC_FAILURE,
	[getMessageId(WALLET_REJECTED)]: ARABIC_WALLET_REJECTED,
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

	it("never shows an unrecognised error message verbatim", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<ErrorProbe cause={new Error("Agent approval step returned an unexpected payload")} />
				</I18nProvider>,
			),
		);
		expect(container.textContent).toBe(GENERIC_FAILURE);

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.textContent).toBe(ARABIC_GENERIC_FAILURE);
	});

	it("retranslates a stored wallet rejection when the locale changes", () => {
		const rejection = Object.assign(new Error("User rejected the request."), { code: 4001 });
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<ErrorProbe cause={rejection} />
				</I18nProvider>,
			),
		);
		expect(container.textContent).toBe(WALLET_REJECTED);

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.textContent).toBe(ARABIC_WALLET_REJECTED);
	});

	it.each([
		["Must deposit before performing actions.", "No balance on Hyperliquid. Deposit first."],
		["Builder fee has not been approved for this account.", "Builder fee has not been approved for this account."],
	])("translates a known exchange rejection and shows an unknown one unchanged: %s", (text, expected) => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<ErrorProbe cause={new ApiRequestError({ status: "err", response: text }, text)} />
				</I18nProvider>,
			),
		);
		expect(container.textContent).toBe(expected);
	});
});
