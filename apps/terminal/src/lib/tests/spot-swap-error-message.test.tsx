// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type SpotSwapError, SpotSwapErrorMessage } from "@/components/trade/components/spot-swap-modal";

const BLOCKED_MESSAGE = "Another order for this market is still being confirmed.";
const ARABIC_BLOCKED_MESSAGE = "لا يزال تأكيد طلب آخر لهذا السوق جارياً.";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(BLOCKED_MESSAGE)]: ARABIC_BLOCKED_MESSAGE,
};

function ErrorProbe() {
	const [error] = useState<SpotSwapError>({ kind: "blocked" });
	return (
		<div role="alert">
			<SpotSwapErrorMessage error={error} />
		</div>
	);
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
		expect(container.textContent).toBe(BLOCKED_MESSAGE);

		act(() => {
			i18n.loadAndActivate({ locale: "ar", messages: arabicMessages });
		});
		expect(container.textContent).toBe(ARABIC_BLOCKED_MESSAGE);
	});
});
