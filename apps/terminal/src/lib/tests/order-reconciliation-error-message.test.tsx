// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrderQueueErrorMessage } from "@/components/trade/tradebox/order-queue-error-message";
import { type OrderReconciliationErrorCode, orderReconciliationError } from "@/lib/trade/order-reconciliation-feedback";

const UNCONFIRMED =
	"The exchange did not return a final order status. Review open orders and positions before retrying.";
const ARABIC_UNCONFIRMED = "لم تُرجع البورصة حالة نهائية للطلب. راجع الطلبات المفتوحة والمراكز قبل إعادة المحاولة.";
const TWAP_UNCONFIRMED = "The exchange did not return a final TWAP status. Review active TWAP orders before retrying.";
const ARABIC_TWAP_UNCONFIRMED = "لم تُرجع البورصة حالة نهائية لطلب TWAP. راجع طلبات TWAP النشطة قبل إعادة المحاولة.";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(UNCONFIRMED)]: ARABIC_UNCONFIRMED,
	[getMessageId(TWAP_UNCONFIRMED)]: ARABIC_TWAP_UNCONFIRMED,
};

function ErrorProbe({ code }: { code: OrderReconciliationErrorCode }) {
	const [error] = useState(() => orderReconciliationError(code));
	return <OrderQueueErrorMessage error={error} />;
}

describe("OrderQueueErrorMessage", () => {
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

	it.each([
		["order", "status-unconfirmed", UNCONFIRMED, ARABIC_UNCONFIRMED],
		["TWAP", "twap-status-unconfirmed", TWAP_UNCONFIRMED, ARABIC_TWAP_UNCONFIRMED],
	] as const)("retranslates an existing %s reconciliation descriptor when the locale changes", (_, code, en, ar) => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<ErrorProbe code={code} />
				</I18nProvider>,
			),
		);
		expect(container.textContent).toBe(en);

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.textContent).toBe(ar);
	});

	it("preserves a raw exchange error", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<OrderQueueErrorMessage error="TWAP order rejected by exchange" />
				</I18nProvider>,
			),
		);
		expect(container.textContent).toBe("TWAP order rejected by exchange");

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.textContent).toBe("TWAP order rejected by exchange");
	});
});
