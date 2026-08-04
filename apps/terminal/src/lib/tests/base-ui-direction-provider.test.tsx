/** @vitest-environment jsdom */

import { useDirection } from "@base-ui/react/direction-provider";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BaseUiDirectionProvider } from "@/providers/base-ui-direction";

function DirectionProbe() {
	return <output data-testid="direction">{useDirection()}</output>;
}

describe("BaseUiDirectionProvider", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("updates Base UI direction when the locale changes", () => {
		const testI18n = setupI18n({ locale: "en", messages: { en: {}, ar: {} } });
		act(() => {
			root.render(
				<I18nProvider i18n={testI18n}>
					<BaseUiDirectionProvider>
						<DirectionProbe />
					</BaseUiDirectionProvider>
				</I18nProvider>,
			);
		});
		expect(container.textContent).toBe("ltr");

		act(() => testI18n.activate("ar"));
		expect(container.textContent).toBe("rtl");
	});
});
