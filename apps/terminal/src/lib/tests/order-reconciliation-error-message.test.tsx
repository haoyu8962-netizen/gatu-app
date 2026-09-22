// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrderToast } from "@/components/trade/tradebox/order-toast";
import { type OrderReconciliationErrorCode, orderReconciliationError } from "@/lib/trade/order-reconciliation-feedback";
import type { OrderQueueItem } from "@/stores/use-order-queue-store";

const UNCONFIRMED = "Unconfirmed — review before retrying";
const ARABIC_UNCONFIRMED = "غير مؤكد — راجع الطلب قبل إعادة المحاولة";
const TWAP_UNCONFIRMED = "Review active TWAP orders before retrying";
const ARABIC_TWAP_UNCONFIRMED = "راجع طلبات TWAP النشطة قبل إعادة المحاولة";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(UNCONFIRMED)]: ARABIC_UNCONFIRMED,
	[getMessageId(TWAP_UNCONFIRMED)]: ARABIC_TWAP_UNCONFIRMED,
};

function ErrorProbe({ code }: { code: OrderReconciliationErrorCode }) {
	const [error] = useState(() => orderReconciliationError(code));
	return (
		<OrderToast order={queueItem(error, "unconfirmed", code === "twap-status-unconfirmed")} onDismiss={() => {}} />
	);
}

function queueItem(error: OrderQueueItem["error"], status: OrderQueueItem["status"], twap = false): OrderQueueItem {
	return {
		id: "reconciliation-message",
		owner: "0x1111111111111111111111111111111111111111",
		env: "Mainnet",
		createdAt: 0,
		status,
		orderType: twap ? "twap" : "market",
		error,
	};
}

describe("OrderToast reconciliation messages", () => {
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
		expect(container.querySelector('[role="status"]')?.textContent).toContain(en);
		const originalToast = container.querySelector("[data-order-feedback]");

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.querySelector('[role="status"]')?.textContent).toContain(ar);
		expect(container.querySelector("[data-order-feedback]")).toBe(originalToast);
		expect(container.querySelector('[role="status"]')?.textContent).not.toContain(en);
	});

	it("preserves a raw exchange error", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<OrderToast order={queueItem("TWAP order rejected by exchange", "failed", true)} onDismiss={() => {}} />
				</I18nProvider>,
			),
		);
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("TWAP order rejected by exchange");

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("TWAP order rejected by exchange");
	});
});
