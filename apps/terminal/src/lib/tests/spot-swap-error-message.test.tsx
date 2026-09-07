// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type SpotSwapError, SpotSwapErrorMessage } from "@/components/trade/components/spot-swap-modal";
import { SpotSwapExecutionError } from "@/domain/trade/spot-swap-execution-guard";
import { getOrderSubmissionFeedback } from "@/lib/trade/order-submission-feedback";

const CONDITIONS_CHANGED_MESSAGE =
	"Order conditions changed before it was confirmed. Review the order and submit it again.";
const ARABIC_CONDITIONS_CHANGED_MESSAGE = "تغيرت شروط الأمر قبل تأكيده. راجع الأمر وأرسله مجددًا.";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(CONDITIONS_CHANGED_MESSAGE)]: ARABIC_CONDITIONS_CHANGED_MESSAGE,
};

function ErrorProbe() {
	const [error] = useState<SpotSwapError>(() => {
		const feedback = getOrderSubmissionFeedback(new SpotSwapExecutionError("quote-changed"));
		if (!feedback) throw new Error("Expected localized swap feedback");
		return feedback;
	});
	return <SpotSwapErrorMessage error={error} />;
}

describe("SpotSwapErrorMessage", () => {
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

	it("retranslates an existing error descriptor when the locale changes", () => {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ErrorProbe />
				</I18nProvider>,
			);
		});
		expect(container.querySelector('[role="alert"]')).not.toBeNull();
		expect(container.textContent).toBe(CONDITIONS_CHANGED_MESSAGE);

		act(() => {
			i18n.loadAndActivate({ locale: "ar", messages: arabicMessages });
		});
		expect(container.textContent).toBe(ARABIC_CONDITIONS_CHANGED_MESSAGE);
	});
});
